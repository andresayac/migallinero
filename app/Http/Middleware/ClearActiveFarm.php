<?php

namespace App\Http\Middleware;

use App\Tenancy\ActiveFarmResolver;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Limpia el contexto de granja activa al terminar la petición para que no se
 * filtre en peticiones posteriores reutilizadas (testing, jobs largos, etc.).
 */
class ClearActiveFarm
{
    public function __construct(private ActiveFarmResolver $resolver) {}

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $this->resolver->clear();

        return $response;
    }
}
