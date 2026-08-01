<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Marca las peticiones a /api/* como "espera JSON".
 *
 * Sin esto, un cliente que no manda `Accept: application/json` recibe el
 * comportamiento pensado para navegadores: el middleware `auth` intenta
 * redirigir a la ruta `login`, que en esta app no existe (la pantalla de acceso
 * la sirve el router de Vue), y la respuesta acaba siendo un error 500 en vez de
 * un 401.
 *
 * Lo resolvemos en el propio request, no en el manejador de excepciones, porque
 * paquetes de desarrollo como Collision sustituyen ese manejador y la
 * configuración `shouldRenderJsonWhen` deja de aplicarse: el comportamiento
 * cambiaría entre desarrollo y producción, que es justo lo que no queremos en la
 * capa de autenticación.
 */
class ForceJsonResponse
{
    public function handle(Request $request, Closure $next): Response
    {
        $request->headers->set('Accept', 'application/json');

        return $next($request);
    }
}
