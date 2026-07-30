<?php

namespace App\Http\Controllers;

use App\Models\ChickenMovement;
use App\Models\Customer;
use App\Models\EggCategory;
use App\Models\EggCollection;
use App\Models\Incident;
use App\Models\MortalityCause;
use App\Models\Payment;
use App\Models\Pen;
use App\Models\Presentation;
use App\Models\Sale;
use App\Models\Vaccine;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Endpoints de sincronización offline.
 *
 * El cliente guarda registros en IndexedDB con `local_uuid` y luego sube un
 * lote por granja cuando vuelve la conexión. Aquí los hacemos idempotentes:
 * si ya existe un registro con el mismo `(farm_id, local_uuid)`, no se
 * duplica sino que se actualiza (UPSERT).
 */
class SyncController extends Controller
{
    /** Mapa entity → modelo + relaciones anidadas esperadas. */
    protected array $entities = [
        'pens' => [Pen::class, []],
        'egg_categories' => [EggCategory::class, []],
        'presentations' => [Presentation::class, []],
        'mortality_causes' => [MortalityCause::class, []],
        'egg_collections' => [EggCollection::class, ['lines']],
        'chicken_movements' => [ChickenMovement::class, []],
        'vaccines' => [Vaccine::class, []],
        'incidents' => [Incident::class, []],
        'customers' => [Customer::class, []],
        'sales' => [Sale::class, ['lines']],
        'payments' => [Payment::class, []],
    ];

    public function push(Request $request)
    {
        $data = $request->validate([
            'items' => ['required', 'array'],
            'items.*.entity' => ['required', 'string'],
            'items.*.action' => ['required', 'in:create,update,delete'],
            'items.*.local_uuid' => ['required', 'string'],
            'items.*.payload' => ['required', 'array'],
        ]);

        $results = [];
        $errors = [];

        foreach ($data['items'] as $item) {
            try {
                $results[] = DB::transaction(function () use ($item) {
                    return $this->apply($item);
                });
            } catch (\Throwable $e) {
                $errors[] = [
                    'local_uuid' => $item['local_uuid'],
                    'entity' => $item['entity'],
                    'error' => $e->getMessage(),
                ];
            }
        }

        return response()->json([
            'applied' => $results,
            'errors' => $errors,
        ]);
    }

    /**
     * Aplica un item (create/update/delete) en la granja activa de forma
     * idempotente por local_uuid.
     */
    protected function apply(array $item): array
    {
        $entity = $item['entity'];
        if (! isset($this->entities[$entity])) {
            abort(400, "Entidad no soportada: {$entity}");
        }
        [$modelClass, $relations] = $this->entities[$entity];

        $payload = $this->snake($item['payload']);
        $localUuid = $item['local_uuid'];

        // El middleware `active.farm` ya activó el contexto de granja, así que
        // el global scope del trait filtra automáticamente por la granja del
        // usuario. Usamos localUuid (deduplicación idempotente) como clave.
        // Ignoramos el farm_id del payload porque el cliente usa UUIDs que no
        // coinciden con el id numérico del backend.
        $existing = $modelClass::where('local_uuid', $localUuid)->first();

        if ($item['action'] === 'delete') {
            $existing?->delete();

            return ['entity' => $entity, 'local_uuid' => $localUuid, 'action' => 'deleted'];
        }

        $payload = Arr::except($payload, ['pending_sync', 'remote_id', 'farm_id']);

        // Traducir cualquier campo *_id cuyo valor sea un UUID referenciando
        // un catálogo local por su local_uuid al id numérico real del backend.
        // Esto unifica el modelo offline-first (UUIDs) con el relacional (ids).
        $payload = $this->resolveForeignUuids($entity, $payload);

        if ($existing) {
            $before = $existing->toArray();
            $existing->update($payload);
            $this->syncRelations($existing, $item['payload']['lines'] ?? []);

            return [
                'entity' => $entity,
                'local_uuid' => $localUuid,
                'id' => $existing->id,
                'action' => 'updated',
            ];
        }

        $payload['local_uuid'] = $localUuid;
        // El trait rellena farm_id desde el contexto activo.
        /** @var Model $instance */
        $instance = $modelClass::create($payload);
        $this->syncRelations($instance, $item['payload']['lines'] ?? []);

        return [
            'entity' => $entity,
            'local_uuid' => $localUuid,
            'id' => $instance->id,
            'action' => 'created',
        ];
    }

    /**
     * Reemplaza las líneas anidadas (sale_lines, egg_collection_lines) por
     * las que llegan en el payload del cliente, borrando las previas.
     */
    protected function syncRelations($instance, array $lines): void
    {
        if (empty($lines)) {
            return;
        }

        if ($instance instanceof Sale) {
            $instance->lines()->delete();
            foreach ($lines as $line) {
                $instance->lines()->create($this->resolveForeignUuids('sale_lines', $this->snake($line)));
            }
        } elseif ($instance instanceof EggCollection) {
            $instance->lines()->delete();
            $total = 0;
            foreach ($lines as $line) {
                $snake = $this->resolveForeignUuids('egg_collection_lines', $this->snake($line));
                $instance->lines()->create($snake);
                $total += $snake['qty'] ?? 0;
            }
            $instance->update(['total' => $total]);
        }
    }

    /**
     * Mapa campos-fk → modelo destino (catálogos referenciados por local_uuid).
     * Permite resolver relaciones cuando el cliente usa UUIDs en sus registros.
     */
    protected array $fkMap = [
        'pen_id' => Pen::class,
        'egg_category_id' => EggCategory::class,
        'category_id' => EggCategory::class,
        'presentation_id' => Presentation::class,
        'customer_id' => Customer::class,
        'sale_id' => Sale::class,
        'egg_collection_id' => EggCollection::class,
    ];

    /**
     * Sustituye cualquier *_id tipo UUID por el id numérico real del catálogo.
     * Si no se encuentra (UUID null o ya numérico), se deja como viene o null.
     */
    protected function resolveForeignUuids(string $entity, array $payload): array
    {
        foreach ($this->fkMap as $field => $modelClass) {
            if (! isset($payload[$field])) {
                continue;
            }
            $value = $payload[$field];

            // Si ya es numérico o null, no hay nada que resolver.
            if ($value === null || is_numeric($value)) {
                continue;
            }

            // Sólo resolver si parece UUID (formato xxxx-xxxx-...).
            if (! is_string($value) || strpos($value, '-') === false) {
                continue;
            }

            // Buscamos el catálogo por local_uuid (el scope activa la granja).
            $related = $modelClass::where('local_uuid', $value)->first();
            $payload[$field] = $related?->id;
        }

        // El frontend usa `categoryId` (camel) en las líneas; el snake lo
        // convierte a `category_id`, pero la columna real es `egg_category_id`.
        if (array_key_exists('category_id', $payload)) {
            $payload['egg_category_id'] = $payload['category_id'];
            unset($payload['category_id']);
        }

        return $payload;
    }

    /**
     * Convierte claves camelCase → snake_case de un array (1 nivel).
     */
    protected function snake(array $data): array
    {
        $out = [];
        foreach ($data as $key => $value) {
            $out[Str::snake($key)] = $value;
        }

        return $out;
    }
}
