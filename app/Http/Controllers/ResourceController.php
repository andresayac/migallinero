<?php

namespace App\Http\Controllers;

use App\Tenancy\ActiveFarmResolver;
use App\Tenancy\EntityRegistry;
use App\Tenancy\EntityWriter;
use App\Tenancy\FarmPermissions;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Controlador genérico CRUD para las entidades con trait BelongsToFarm.
 *
 * El aislamiento por granja lo garantiza el global scope del trait (activado
 * por el middleware `active.farm`), así que `findOrFail` nunca puede alcanzar
 * un registro de otra granja. La autorización por rol la resuelve
 * `FarmPermissions`, y la validación/normalización `EntityWriter`.
 */
class ResourceController extends Controller
{
    public function __construct(
        private EntityWriter $writer,
        private ActiveFarmResolver $resolver,
    ) {}

    public function index(Request $request, string $entity)
    {
        $this->authorizeAction($entity, 'read');

        $validated = $request->validate([
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:500'],
            'since' => ['sometimes', 'date'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);

        $model = $this->resolveModel($entity);

        $builder = $model::query()->with(EntityRegistry::relations($entity));

        // Permite sincronización incremental: sólo lo cambiado desde `since`.
        if (isset($validated['since'])) {
            $builder->where('updated_at', '>=', $validated['since']);
        }

        return response()->json(
            $builder->orderBy('id')->paginate($validated['per_page'] ?? 100)
        );
    }

    public function store(Request $request, string $entity)
    {
        $this->authorizeAction($entity, 'write');

        $instance = $this->writer->upsert(
            $entity,
            $request->all(),
            $this->findByLocalUuid($entity, $request->input('localUuid') ?? $request->input('local_uuid')),
            $request->user()?->id,
        );

        return response()->json(
            $instance->fresh(EntityRegistry::relations($entity)),
            201
        );
    }

    public function show(Request $request, string $entity, int $id)
    {
        $this->authorizeAction($entity, 'read');

        $model = $this->resolveModel($entity);

        return response()->json(
            $model::with(EntityRegistry::relations($entity))->findOrFail($id)
        );
    }

    public function update(Request $request, string $entity, int $id)
    {
        $this->authorizeAction($entity, 'write');

        $model = $this->resolveModel($entity);
        $instance = $model::findOrFail($id);

        $instance = $this->writer->upsert($entity, $request->all(), $instance, $request->user()?->id);

        return response()->json($instance->fresh(EntityRegistry::relations($entity)));
    }

    public function destroy(Request $request, string $entity, int $id)
    {
        $this->authorizeAction($entity, 'delete');

        $model = $this->resolveModel($entity);
        $instance = $model::findOrFail($id);

        $this->writer->delete($entity, $instance, $request->user()?->id);

        return response()->json(['message' => 'Eliminado']);
    }

    /** @return class-string<Model> */
    private function resolveModel(string $entity): string
    {
        abort_unless(EntityRegistry::has($entity), 404, "Entidad desconocida: {$entity}");

        return EntityRegistry::model($entity);
    }

    /**
     * UPSERT idempotente también por REST: si el cliente reintenta un POST con
     * el mismo local_uuid (típico con conexión intermitente) actualizamos en
     * vez de duplicar el registro.
     */
    private function findByLocalUuid(string $entity, mixed $localUuid): ?Model
    {
        if (! is_string($localUuid) || $localUuid === '') {
            return null;
        }

        $model = $this->resolveModel($entity);

        return $model::where('local_uuid', $localUuid)->first();
    }

    private function authorizeAction(string $entity, string $action): void
    {
        abort_unless(EntityRegistry::has($entity), 404, "Entidad desconocida: {$entity}");

        $role = $this->resolver->role();

        $allowed = match ($action) {
            'read' => FarmPermissions::canRead($role, $entity),
            'write' => FarmPermissions::canWrite($role, $entity),
            'delete' => FarmPermissions::canDelete($role, $entity),
            default => false,
        };

        abort_unless($allowed, 403, 'Tu rol no tiene permiso para esta acción.');
    }
}
