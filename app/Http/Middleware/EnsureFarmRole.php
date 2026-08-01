<?php

namespace App\Http\Middleware;

use App\Tenancy\ActiveFarmResolver;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Exige que el usuario tenga uno de los roles indicados EN LA GRANJA ACTIVA.
 *
 * Uso: `->middleware('farm.role:admin')` o `farm.role:admin,vendedor`.
 *
 * El rol vive en la tabla pivote `farm_user`, no en `users.role`: un mismo
 * usuario puede ser admin de su granja y operario de otra. `EnsureActiveFarm`
 * resuelve la granja y guarda el rol antes de que llegue este middleware.
 */
class EnsureFarmRole
{
    public function __construct(private ActiveFarmResolver $resolver) {}

    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $role = $this->resolver->role();

        if ($role === null) {
            return response()->json(['message' => 'No hay una granja activa.'], 403);
        }

        if (! in_array($role, $roles, true)) {
            return response()->json([
                'message' => 'Tu rol no tiene permiso para esta acción.',
            ], 403);
        }

        return $next($request);
    }
}
