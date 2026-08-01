<?php

namespace App\Tenancy;

use App\Http\Requests\EntityRules;
use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Escritura de entidades de la granja, compartida por el CRUD REST y por
 * `/sync/push`.
 *
 * Antes cada controlador hacía su propia normalización: uno filtraba por
 * fillable y el otro no, uno resolvía los UUID de las FKs y el otro tampoco
 * validaba nada. El resultado eran registros con FK en NULL y totales
 * incoherentes según por dónde entraran. Aquí hay un único camino:
 *
 *   camelCase → snake_case → validación → resolución de FK → escritura
 *   → líneas anidadas → recálculo de totales → auditoría
 */
class EntityWriter
{
    /**
     * Campos de control del cliente que nunca se persisten.
     *
     * `type` NO está en la lista aunque el cliente lo use como discriminador
     * (`type: 'sale'`): en `chicken_movements` e `incidents` es una columna real
     * y obligatoria. Los campos sin regla de validación se descartan solos,
     * porque `Arr::only()` trabaja sobre los datos ya validados.
     */
    private const CLIENT_ONLY = [
        'pending_sync', 'remote_id', 'farm_id', 'id', 'created_at', 'updated_at',
        'created_by', 'audit_before', 'lines',
    ];

    public function __construct(
        private ActiveFarmResolver $resolver,
        private PeriodLock $periodLock,
    ) {}

    /**
     * Crea o actualiza (UPSERT idempotente por local_uuid).
     *
     * @param  array<string, mixed>  $input  payload crudo del cliente (camelCase permitido)
     */
    public function upsert(string $entity, array $input, ?Model $existing = null, ?int $userId = null): Model
    {
        $payload = $this->normalize($entity, $input, $existing !== null);

        // `lines` no es un atributo del modelo: se extrae antes de fill() para
        // no chocar con preventSilentlyDiscardingAttributes.
        $lines = Arr::pull($payload, 'lines');

        return DB::transaction(function () use ($entity, $payload, $lines, $existing, $userId) {
            $before = $existing?->only(array_keys($payload));

            if ($existing) {
                $existing->fill($payload);
                $existing->save();
                $model = $existing;
            } else {
                $modelClass = EntityRegistry::model($entity);
                /** @var Model $model */
                $model = new $modelClass;
                $model->fill($payload);
                if ($userId !== null && $this->hasColumn($model, 'created_by')) {
                    $model->created_by = $userId;
                }
                $model->save();
            }

            $this->syncLines($entity, $model, $lines);
            // Sólo se recalcula si la petición trajo líneas: una actualización
            // parcial (p.ej. sólo el estado de una venta) no debe poner los
            // totales a cero porque no venían líneas en el payload.
            $this->recalculateTotals($entity, $model, $lines !== null);

            $this->audit($entity, $model, $existing ? 'update' : 'create', $before, $userId);

            return $model;
        });
    }

    public function delete(string $entity, Model $model, ?int $userId = null): void
    {
        DB::transaction(function () use ($entity, $model, $userId) {
            $before = $model->toArray();
            $model->delete();
            $this->audit($entity, $model, 'delete', $before, $userId);
        });
    }

    /**
     * Normaliza y valida el payload. Devuelve sólo campos persistibles más, si
     * aplica, la clave `lines` con las líneas ya normalizadas.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function normalize(string $entity, array $input, bool $isUpdate = false): array
    {
        $snake = $this->toSnake($input);

        // Alias histórico: el cliente manda `categoryId` en las líneas y en
        // algunos registros, pero la columna real es `egg_category_id`.
        $snake = $this->applyAliases($snake);

        // Resolver FKs enviadas como local_uuid ANTES de validar, para que las
        // reglas `exists` trabajen sobre ids numéricos reales.
        $snake = $this->resolveForeignKeys($snake);

        if (isset($snake['lines']) && is_array($snake['lines'])) {
            $snake['lines'] = array_values(array_map(
                fn ($line) => is_array($line)
                    ? $this->resolveForeignKeys($this->applyAliases($this->toSnake($line)))
                    : [],
                $snake['lines']
            ));
        }

        $validated = Validator::make($snake, EntityRules::for($entity, $isUpdate))->validate();

        // El candado de período se valida en el servidor: la comprobación del
        // cliente es sólo de interfaz y se puede saltar llamando a la API.
        $this->periodLock->assert($validated, EntityRules::operationalDateFields($entity));

        $modelClass = EntityRegistry::model($entity);
        $fillable = (new $modelClass)->getFillable();

        $data = Arr::only($validated, $fillable);

        if (EntityRegistry::hasLines($entity) && array_key_exists('lines', $validated)) {
            $data['lines'] = $validated['lines'];
        }

        return $data;
    }

    /**
     * Reemplaza las líneas anidadas por las recibidas.
     *
     * `null` significa "no vinieron líneas en esta petición" → no se toca nada.
     * Un array vacío sí borra las líneas existentes.
     *
     * @param  array<int, array<string, mixed>>|null  $lines
     */
    private function syncLines(string $entity, Model $model, ?array $lines): void
    {
        if ($lines === null || ! EntityRegistry::hasLines($entity)) {
            return;
        }

        /** @var HasMany $relation */
        $relation = $model->lines();
        $lineClass = $relation->getRelated();
        $lineFillable = $lineClass->getFillable();

        $relation->delete();

        foreach ($lines as $line) {
            $relation->create(Arr::only($line, $lineFillable));
        }
    }

    /**
     * Recalcula los totales desnormalizados desde las líneas reales.
     *
     * El cliente los manda calculados, pero no se puede confiar en ellos: un
     * cliente manipulado podría enviar 1000 huevos en las líneas y total = 1.
     */
    private function recalculateTotals(string $entity, Model $model, bool $linesProvided): void
    {
        if (! EntityRegistry::hasLines($entity)) {
            return;
        }

        // Una venta anulada no debe nada y no ha cobrado nada, con o sin líneas.
        if ($entity === 'sales' && $model->status === 'void') {
            $model->forceFill(['paid' => 0, 'balance' => 0])->save();

            return;
        }

        if (! $linesProvided) {
            return;
        }

        $lines = $model->lines()->get();

        $updates = match ($entity) {
            'egg_collections' => ['total' => (int) $lines->sum('qty')],
            'sales' => [],
            'feed_records' => [
                'total_qty' => (float) $lines->sum('qty'),
                'total_cost' => (int) round($lines->sum('subtotal')),
            ],
            'feed_purchases' => [
                'total_bags' => (int) $lines->sum('bags'),
                'total_qty' => (float) $lines->sum(fn ($l) => (float) $l->bags * (float) $l->kg_per_bag),
                'total_cost' => (int) round($lines->sum('subtotal')),
            ],
            default => [],
        };

        // En ventas los totales dependen del descuento y de lo pagado, así que
        // los derivamos aparte para mantener la coherencia contable.
        if ($entity === 'sales') {
            $subtotal = (float) $lines->sum('subtotal');
            $discount = min((float) $model->discount, $subtotal);
            $total = max(0.0, $subtotal - $discount);
            $paid = min((float) $model->paid, $total);

            $updates = [
                'discount' => (int) round($discount),
                'total' => (int) round($total),
                'paid' => (int) round($paid),
                'balance' => (int) round($total - $paid),
                'status' => (int) round($total - $paid) <= 0
                    ? 'paid'
                    : ((int) round($paid) > 0 ? 'partial' : 'pending'),
            ];

            // Una venta sin líneas (p.ej. un ajuste manual) conserva su total.
            if ($lines->isEmpty()) {
                $updates = [];
            }
        }

        if ($updates !== []) {
            $model->forceFill($updates)->save();
        }
    }

    /**
     * Traduce los `*_id` que llegan como local_uuid al id numérico real.
     *
     * A diferencia de la versión anterior, si el UUID no se encuentra se lanza
     * un error en vez de dejar la FK en NULL: perder en silencio el cliente de
     * una venta o la categoría de una tanda corrompe los reportes sin avisar.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function resolveForeignKeys(array $payload): array
    {
        foreach (EntityRegistry::foreignKeys() as $field => $targetEntity) {
            if (! array_key_exists($field, $payload)) {
                continue;
            }

            $value = $payload[$field];

            if ($value === null || $value === '' || is_int($value) || ctype_digit((string) $value)) {
                $payload[$field] = ($value === null || $value === '') ? null : (int) $value;

                continue;
            }

            if (! is_string($value)) {
                continue;
            }

            $modelClass = EntityRegistry::model($targetEntity);
            $related = $modelClass::where('local_uuid', $value)->first();

            if (! $related) {
                throw ValidationException::withMessages([
                    $field => ["No se encontró el registro relacionado ({$targetEntity}: {$value}). Sincroniza primero los catálogos."],
                ]);
            }

            $payload[$field] = $related->getKey();
        }

        return $payload;
    }

    /** @param array<string, mixed> $payload */
    private function applyAliases(array $payload): array
    {
        if (array_key_exists('category_id', $payload)) {
            $payload['egg_category_id'] ??= $payload['category_id'];
            unset($payload['category_id']);
        }

        return $payload;
    }

    /**
     * camelCase → snake_case, descartando los campos de control del cliente.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function toSnake(array $data): array
    {
        $out = [];

        foreach ($data as $key => $value) {
            $snake = Str::snake((string) $key);

            if ($snake === 'lines') {
                $out['lines'] = $value;

                continue;
            }

            if (in_array($snake, self::CLIENT_ONLY, true)) {
                continue;
            }

            $out[$snake] = $value;
        }

        return $out;
    }

    /**
     * Deja rastro de la escritura en `audit_logs`.
     *
     * Esta tabla existía desde el principio y nunca se escribía, así que no
     * había ninguna traza real de quién cambió qué en el servidor.
     *
     * @param  array<string, mixed>|null  $before
     */
    private function audit(string $entity, Model $model, string $action, ?array $before, ?int $userId): void
    {
        $after = $model->fresh()?->toArray() ?? $model->toArray();

        // Sólo auditamos cambios reales para no llenar la tabla de ruido.
        if ($action === 'update' && $before !== null) {
            $changed = array_filter(
                $before,
                fn ($value, $key) => ($after[$key] ?? null) != $value,
                ARRAY_FILTER_USE_BOTH
            );

            if ($changed === []) {
                return;
            }
        }

        AuditLog::create([
            'user_id' => $userId,
            'action' => $action,
            'entity' => $entity,
            'entity_id' => $model->getKey(),
            'before' => $before,
            'after' => $action === 'delete' ? null : $after,
        ]);
    }

    /** @var array<string, array<int, string>> caché de columnas por tabla */
    private static array $columnCache = [];

    private function hasColumn(Model $model, string $column): bool
    {
        $table = $model->getTable();

        self::$columnCache[$table] ??= $model->getConnection()
            ->getSchemaBuilder()
            ->getColumnListing($table);

        return in_array($column, self::$columnCache[$table], true);
    }
}
