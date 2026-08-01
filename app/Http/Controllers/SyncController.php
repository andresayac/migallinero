<?php

namespace App\Http\Controllers;

use App\Tenancy\ActiveFarmResolver;
use App\Tenancy\EntityRegistry;
use App\Tenancy\EntityWriter;
use App\Tenancy\FarmPermissions;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Sincronización offline.
 *
 * El cliente guarda en IndexedDB con `local_uuid` y sube un lote cuando vuelve
 * la conexión. `push` es idempotente: si ya existe un registro con el mismo
 * `(farm_id, local_uuid)` se actualiza en vez de duplicarse.
 *
 * `pull` permite reconstruir la base local desde el servidor, que es lo que
 * evita perder toda la granja si el usuario cambia de teléfono o borra los
 * datos del navegador.
 */
class SyncController extends Controller
{
    /** Tope por lote: sin él, un solo POST podía abrir miles de transacciones. */
    private const MAX_ITEMS = 500;

    public function __construct(
        private EntityWriter $writer,
        private ActiveFarmResolver $resolver,
    ) {}

    public function push(Request $request)
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'max:'.self::MAX_ITEMS],
            'items.*.entity' => ['required', 'string', Rule::in(EntityRegistry::names())],
            'items.*.action' => ['required', Rule::in(['create', 'update', 'delete'])],
            'items.*.local_uuid' => ['required', 'string', 'max:64'],
            'items.*.payload' => ['required', 'array'],
        ]);

        $applied = [];
        $errors = [];
        $userId = $request->user()?->id;

        foreach ($data['items'] as $item) {
            try {
                $applied[] = DB::transaction(fn () => $this->apply($item, $userId));
            } catch (ValidationException $e) {
                // Error permanente: reintentarlo no lo va a arreglar. El cliente
                // lo marca como fallido y deja de reenviarlo en bucle cada 30s.
                $errors[] = [
                    'local_uuid' => $item['local_uuid'],
                    'entity' => $item['entity'],
                    'permanent' => true,
                    'message' => $this->firstMessage($e),
                ];
            } catch (\Throwable $e) {
                // No exponemos el mensaje interno: antes devolvía el SQL con
                // nombres de tabla, columnas y valores. Queda sólo en el log.
                Log::error('[sync] fallo al aplicar item', [
                    'entity' => $item['entity'],
                    'local_uuid' => $item['local_uuid'],
                    'exception' => $e,
                ]);

                $errors[] = [
                    'local_uuid' => $item['local_uuid'],
                    'entity' => $item['entity'],
                    'permanent' => false,
                    'message' => 'No se pudo guardar en el servidor. Se reintentará.',
                ];
            }
        }

        return response()->json([
            'applied' => $applied,
            'errors' => $errors,
        ]);
    }

    /**
     * Descarga los datos de la granja activa.
     *
     * Acepta `?since=` (ISO 8601) para traer sólo lo modificado, y devuelve
     * `server_time` para que el cliente lo use como marca del próximo pull.
     */
    public function pull(Request $request)
    {
        $validated = $request->validate([
            'since' => ['sometimes', 'nullable', 'date'],
            'entities' => ['sometimes', 'array'],
            'entities.*' => ['string', Rule::in(EntityRegistry::names())],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:1000'],
        ]);

        $since = $validated['since'] ?? null;
        $limit = $validated['limit'] ?? 500;
        $entities = $validated['entities'] ?? EntityRegistry::names();

        $out = [];
        $truncated = false;

        foreach ($entities as $entity) {
            if (! FarmPermissions::canRead($this->resolver->role(), $entity)) {
                continue;
            }

            $modelClass = EntityRegistry::model($entity);

            $rows = $modelClass::query()
                ->when(
                    EntityRegistry::hasLines($entity),
                    fn ($q) => $q->with('lines')
                )
                ->when($since, fn ($q) => $q->where('updated_at', '>=', $since))
                ->orderBy('updated_at')
                ->orderBy('id')
                ->limit($limit)
                ->get();

            $truncated = $truncated || $rows->count() >= $limit;
            $out[$entity] = $rows;
        }

        return response()->json([
            'server_time' => now()->toIso8601String(),
            // Avisa al cliente de que debe volver a pedir con un `since` mayor:
            // callar un truncamiento haría creer que ya bajó todo.
            'truncated' => $truncated,
            'data' => $out,
        ]);
    }

    /**
     * Aplica un item (create/update/delete) de forma idempotente por local_uuid.
     *
     * @param  array{entity: string, action: string, local_uuid: string, payload: array<string, mixed>}  $item
     * @return array<string, mixed>
     */
    private function apply(array $item, ?int $userId): array
    {
        $entity = $item['entity'];
        $localUuid = $item['local_uuid'];
        $isDelete = $item['action'] === 'delete';
        $role = $this->resolver->role();

        $allowed = $isDelete
            ? FarmPermissions::canDelete($role, $entity)
            : FarmPermissions::canWrite($role, $entity);

        if (! $allowed) {
            throw ValidationException::withMessages([
                'entity' => ["Tu rol no tiene permiso para modificar {$entity}."],
            ]);
        }

        $modelClass = EntityRegistry::model($entity);

        // El global scope del trait ya restringe a la granja activa.
        $existing = $modelClass::where('local_uuid', $localUuid)->first();

        if ($isDelete) {
            if ($existing) {
                $this->writer->delete($entity, $existing, $userId);
            }

            return ['entity' => $entity, 'local_uuid' => $localUuid, 'action' => 'deleted'];
        }

        $payload = $item['payload'];
        $payload['local_uuid'] = $localUuid;

        $model = $this->writer->upsert($entity, $payload, $existing, $userId);

        return [
            'entity' => $entity,
            'local_uuid' => $localUuid,
            'id' => $model->getKey(),
            'action' => $existing ? 'updated' : 'created',
        ];
    }

    private function firstMessage(ValidationException $e): string
    {
        $first = collect($e->errors())->flatten()->first();

        return is_string($first) ? $first : 'Datos inválidos.';
    }
}
