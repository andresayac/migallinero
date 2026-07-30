<?php

namespace App\Http\Middleware;

use App\Models\Farm;
use App\Tenancy\ActiveFarmResolver;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Para APIs autenticadas con token Sanctum, resolvemos la granja activa desde
 * la cabecera `X-Farm-Id`. En el MVP cada usuario tiene una sola granja, así
 * que si no viene la cabecera usamos su primera granja.
 */
class EnsureActiveFarm
{
    public function __construct(private ActiveFarmResolver $resolver) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user) {
            return $next($request);
        }

        $farmId = $request->header('X-Farm-Id');

        // Si no viene la cabecera, intentamos la única granja del usuario (MVP).
        if (! $farmId) {
            $farmId = $user->farms()->first()?->id;
        }

        if (! $farmId) {
            return response()->json([
                'message' => 'No tienes ninguna granja asignada.',
            ], 403);
        }

        // Validamos que el usuario pertenezca a esa granja (y esté activo).
        // Consulta directa a la tabla pivote para evitar errores con wherePivot dentro de whereHas.
        $hasAccess = DB::table('farm_user')
            ->where('farm_id', $farmId)
            ->where('user_id', $user->id)
            ->where('active', true)
            ->exists();

        if (! $hasAccess) {
            return response()->json([
                'message' => 'No tienes acceso a esa granja.',
            ], 403);
        }

        $this->resolver->activate((int) $farmId);

        return $next($request);
    }
}
