<?php

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
|
| La SPA se sirve desde el MISMO origen que la API (Laravel entrega el
| index de Vue), así que en producción no hace falta ningún origen cruzado.
| El único caso legítimo es el servidor de desarrollo de Vite.
|
| El default del framework es `allowed_origins => ['*']`, que permite a
| cualquier web del mundo llamar a la API desde el navegador de la víctima.
| Aquí lo restringimos a una lista explícita vía CORS_ALLOWED_ORIGINS.
|
*/

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    'allowed_origins' => array_values(array_filter(
        array_map('trim', explode(',', (string) env('CORS_ALLOWED_ORIGINS', '')))
    )),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Accept', 'Authorization', 'Content-Type', 'X-Farm-Id', 'X-Requested-With', 'X-XSRF-TOKEN'],

    'exposed_headers' => ['Retry-After'],

    'max_age' => 3600,

    'supports_credentials' => false,

];
