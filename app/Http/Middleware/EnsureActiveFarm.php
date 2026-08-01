<?php

namespace App\Http\Middleware;

use App\Tenancy\ActiveFarmResolver;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Para APIs autenticadas con token Sanctum, resolvemos la granja activa desde
 * la cabecera `X-Farm-Id`. En el MVP cada usuario tiene una sola granja, así
 * que si no viene la cabecera usamos su primera granja activa.
 *
 * IMPORTANTE: el trait `BelongsToFarm` sólo añade el `where farm_id` cuando
 * hay una granja activa. Por eso este middleware corta con 401/403 en vez de
 * dejar pasar sin contexto: un request sin granja resuelta consultaría SIN
 * filtro y expondría datos de otras granjas.
 */
class EnsureActiveFarm
{
    public function __construct(private ActiveFarmResolver $resolver) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'No autenticado.'], 401);
        }

        $header = $request->header('X-Farm-Id');

        // La cabecera debe ser un entero limpio: comparar un string arbitrario
        // contra una columna numérica provoca coerciones silenciosas en MySQL
        // ('1abc' se compara como 1).
        $farmId = null;
        if ($header !== null && $header !== '') {
            if (! ctype_digit((string) $header)) {
                return response()->json(['message' => 'Cabecera X-Farm-Id inválida.'], 422);
            }
            $farmId = (int) $header;
        }

        // Consulta directa a la tabla pivote: devuelve acceso y rol en un solo
        // viaje, y evita los problemas de wherePivot dentro de whereHas.
        $membership = DB::table('farm_user')
            ->where('user_id', $user->id)
            ->where('active', true)
            ->when($farmId !== null, fn ($q) => $q->where('farm_id', $farmId))
            ->orderBy('farm_id')
            ->first(['farm_id', 'role']);

        if (! $membership) {
            return response()->json([
                'message' => $farmId === null
                    ? 'No tienes ninguna granja asignada.'
                    : 'No tienes acceso a esa granja.',
            ], 403);
        }

        $this->resolver->activate((int) $membership->farm_id, $membership->role);

        return $next($request);
    }
}
