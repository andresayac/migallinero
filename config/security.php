<?php

/*
|--------------------------------------------------------------------------
| Cabeceras de seguridad
|--------------------------------------------------------------------------
|
| La política de seguridad de contenido (CSP) es restrictiva por defecto: sólo
| se carga lo que sirve la propia aplicación. Cuando hace falta permitir un
| tercero concreto se añade aquí, en vez de relajar la política entera.
|
| Caso típico: si tienes activada Web Analytics en Cloudflare, Cloudflare
| inyecta su script en cada página y la CSP lo bloquea. Para permitirlo:
|
|   CSP_SCRIPT_SRC=https://static.cloudflareinsights.com
|
| La alternativa —igual de válida— es desactivar Web Analytics en Cloudflare y
| dejar la política sin excepciones.
|
*/

return [

    'csp' => [

        /*
         * Hosts extra permitidos por directiva. Lista separada por comas.
         * Se añaden a 'self'; no lo reemplazan.
         */
        'script_src' => array_values(array_filter(array_map(
            'trim',
            explode(',', (string) env('CSP_SCRIPT_SRC', ''))
        ))),

        'style_src' => array_values(array_filter(array_map(
            'trim',
            explode(',', (string) env('CSP_STYLE_SRC', ''))
        ))),

        'connect_src' => array_values(array_filter(array_map(
            'trim',
            explode(',', (string) env('CSP_CONNECT_SRC', ''))
        ))),

        'img_src' => array_values(array_filter(array_map(
            'trim',
            explode(',', (string) env('CSP_IMG_SRC', ''))
        ))),

        'font_src' => array_values(array_filter(array_map(
            'trim',
            explode(',', (string) env('CSP_FONT_SRC', ''))
        ))),

        /*
         * Desactiva la CSP por completo. Sólo para diagnosticar: deja la app
         * sin una de sus defensas, así que no debería quedarse en true.
         */
        'disabled' => (bool) env('CSP_DISABLED', false),
    ],

];
