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
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Controlador genérico CRUD para cualquier modelo con trait BelongsToFarm.
 *
 * Mapa `entity` (snake case plural del modelo) → clase del modelo.
 * Útil para leer catálogos y registros operativos desde el MVP sin crear
 * 14 controladores idénticos. Se apoya en el middleware `active.farm` para
 * que el trait inyecte el farm_id en cada consulta y creación.
 */
class ResourceController extends Controller
{
    /** Mapa entity => clase del modelo (sólo entidades accesibles vía este endpoint). */
    protected array $modelMap = [
        'pens' => Pen::class,
        'egg_categories' => EggCategory::class,
        'presentations' => Presentation::class,
        'mortality_causes' => MortalityCause::class,
        'egg_collections' => EggCollection::class,
        'chicken_movements' => ChickenMovement::class,
        'vaccines' => Vaccine::class,
        'incidents' => Incident::class,
        'customers' => Customer::class,
        'sales' => Sale::class,
        'payments' => Payment::class,
    ];

    public function index(Request $request, string $entity)
    {
        $model = $this->resolveModel($entity);
        $builder = $model::query();

        // Carga selectiva de relaciones para entidades con líneas.
        if ($entity === 'sales' || $entity === 'egg_collections') {
            $builder->with(['lines']);
        }
        if ($entity === 'sales') {
            $builder->with(['customer']);
        }

        $limit = min($request->integer('per_page', 100), 500);

        return response()->json($builder->latest('id')->paginate($limit));
    }

    public function store(Request $request, string $entity)
    {
        $model = $this->resolveModel($entity);
        $data = $this->prepareData($request, $model);

        $instance = DB::transaction(function () use ($model, $data, $request) {
            $instance = $model::create($data);
            $this->handleRelations($instance, $data, $request);

            return $instance;
        });

        return response()->json($instance->fresh($this->relationsFor($instance)), 201);
    }

    public function show(Request $request, string $entity, int $id)
    {
        $model = $this->resolveModel($entity);
        $instance = $model::with($this->relationsFor($model))->findOrFail($id);

        return response()->json($instance);
    }

    public function update(Request $request, string $entity, int $id)
    {
        $model = $this->resolveModel($entity);
        $instance = $model::findOrFail($id);
        $data = $this->prepareData($request, $model, $instance);

        $instance->update($data);

        return response()->json($instance->fresh($this->relationsFor($instance)));
    }

    public function destroy(Request $request, string $entity, int $id)
    {
        $model = $this->resolveModel($entity);
        $instance = $model::findOrFail($id);
        $instance->delete();

        return response()->json(['message' => 'Eliminado']);
    }

    protected function resolveModel(string $entity): string
    {
        if (! isset($this->modelMap[$entity])) {
            abort(404, "Entidad desconocida: {$entity}");
        }

        return $this->modelMap[$entity];
    }

    /**
     * Filtra los campos recibidos a sólo los fillables del modelo y normaliza
     * los nombres camelCase del frontend → snake_case del backend.
     */
    protected function prepareData(Request $request, string $modelClass, ?Model $existing = null): array
    {
        $fillables = (new $modelClass)->getFillable();
        $snake = $this->camelToSnake($request->all());

        // Si trae `local_uuid` y no coincide con uno existente, lo guardamos
        // para garantizar la deduplicación offline (UPSERT idempotente).
        $data = [];
        foreach ($fillables as $fillable) {
            if (array_key_exists($fillable, $snake)) {
                $data[$fillable] = $snake[$fillable];
            }
        }
        if (! $existing && $request->filled('localUuid')) {
            $data['local_uuid'] = $request->input('localUuid');
        }

        return $data;
    }

    /**
     * Crea líneas anidadas (sale_lines para ventas, egg_collection_lines para tandas).
     */
    protected function handleRelations(Model $instance, array $data, Request $request): void
    {
        $lines = $request->input('lines');
        if (! is_array($lines)) {
            return;
        }

        switch (true) {
            case $instance instanceof Sale:
                foreach ($lines as $line) {
                    $instance->lines()->create($this->camelToSnake($line));
                }
                break;
            case $instance instanceof EggCollection:
                foreach ($lines as $line) {
                    $instance->lines()->create($this->camelToSnake($line));
                }
                break;
        }
    }

    protected function relationsFor(Model|string $model): array
    {
        return match (true) {
            $model instanceof Sale, is_string($model) && $model === Sale::class => ['customer', 'lines'],
            $model instanceof EggCollection, is_string($model) && $model === EggCollection::class => ['lines', 'pen'],
            default => [],
        };
    }

    /**
     * Convierte claves camelCase → snake_case de forma recurrente (un nivel).
     * `localUuid` → `local_uuid`, `collectionAt` → `collection_at`, etc.
     */
    protected function camelToSnake(array $data): array
    {
        $out = [];
        foreach ($data as $key => $value) {
            $snakeKey = Str::snake($key);
            // Excluir campos de control del cliente.
            if (in_array($snakeKey, ['pending_sync', 'pendingSync', 'type', 'remote_id', 'remoteid'])) {
                continue;
            }
            $out[$snakeKey] = $value;
        }

        return $out;
    }
}
