#!/usr/bin/env php
<?php
/**
 * Copia sw.js y workbox-*.js de public/build/ a public/ para que el
 * service worker tenga scope '/' (cubre toda la app, no sólo /build/).
 * Se ejecuta tras `vite build` para que el SW funcione en offline.
 */
$buildDir = __DIR__ . '/public/build';
$publicDir = __DIR__ . '/public';

// Copiar sw.js a public/sw.js
if (file_exists("$buildDir/sw.js")) {
    copy("$buildDir/sw.js", "$publicDir/sw.js");
    echo "✓ sw.js copiado a public/\n";
}

// Copiar manifest.webmanifest a public/ para que tenga scope '/'
if (file_exists("$buildDir/manifest.webmanifest")) {
    copy("$buildDir/manifest.webmanifest", "$publicDir/manifest.webmanifest");
    echo "✓ manifest.webmanifest copiado a public/\n";
}

// Copiar workbox-*.js a public/
foreach (glob("$buildDir/workbox-*.js") as $workbox) {
    $dest = $publicDir . '/' . basename($workbox);
    copy($workbox, $dest);
    echo "✓ " . basename($workbox) . " copiado a public/\n";
}