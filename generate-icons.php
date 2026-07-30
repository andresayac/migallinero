<?php
/**
 * Genera los iconos PWA (192x192, 512x512, 512x512 maskable) y favicon
 * desde el logo del usuario (146743.png).
 *
 * El logo se redimensiona y se compone sobre un fondo verde redondeado
 * para mantener la identidad visual de "Mi Gallinero".
 *
 * Uso: php generate-icons.php
 */

$publicDir = __DIR__ . '/public';
$logoPath  = __DIR__ . '/146743.png';

if (!file_exists($logoPath)) {
    fwrite(STDERR, "No se encuentra el logo en $logoPath\n");
    exit(1);
}

$src = imagecreatefrompng($logoPath);
if (!$src) {
    fwrite(STDERR, "No se pudo abrir el logo PNG\n");
    exit(1);
}

imagesavealpha($src, true);
$srcW = imagesx($src);
$srcH = imagesy($src);

/** Dibuja un rectángulo redondeado relleno (GD no lo tiene nativo). */
function imagefilledroundedrect(
    GdImage $img,
    int $x1, int $y1, int $x2, int $y2,
    int $r,
    int $color,
): void {
    imagefilledrectangle($img, $x1 + $r, $y1, $x2 - $r, $y2, $color);
    imagefilledrectangle($img, $x1, $y1 + $r, $x2, $y2 - $r, $color);
    imagefilledellipse($img, $x1 + $r, $y1 + $r, $r * 2, $r * 2, $color);
    imagefilledellipse($img, $x2 - $r, $y1 + $r, $r * 2, $r * 2, $color);
    imagefilledellipse($img, $x1 + $r, $y2 - $r, $r * 2, $r * 2, $color);
    imagefilledellipse($img, $x2 - $r, $y2 - $r, $r * 2, $r * 2, $color);
}

/**
 * Crea un icono de tamaño $size con fondo verde redondeado y el logo
 * centrado. Si $padding > 0, deja margen verde (para maskable safe zone).
 */
function makeIcon(GdImage $src, int $srcW, int $srcH, int $size, int $padding = 0): GdImage {
    $img = imagecreatetruecolor($size, $size);
    imagesavealpha($img, true);

    // Fondo transparente + rectángulo redondeado verde.
    $transparent = imagecolorallocatealpha($img, 0, 0, 0, 127);
    imagefill($img, 0, 0, $transparent);

    $green = imagecolorallocate($img, 22, 163, 74);
    $radius = (int)($size * 0.18);

    imagefilledroundedrect($img, 0, 0, $size - 1, $size - 1, $radius, $green);

    // Área útil para el logo (menos el padding de safe zone si es maskable).
    $usable = $size - ($padding * 2);

    // El logo se escala para ocupar ~88% del área usable (aire alrededor).
    $logoSize = (int)($usable * 0.88);
    $dstX = (int)(($size - $logoSize) / 2);
    $dstY = (int)(($size - $logoSize) / 2);

    imagecopyresampled(
        $img, $src,
        $dstX, $dstY,
        0, 0,
        $logoSize, $logoSize,
        $srcW, $srcH,
    );

    return $img;
}

// --- 192x192 ---
$img192 = makeIcon($src, $srcW, $srcH, 192);
imagepng($img192, "$publicDir/pwa-192.png");
imagedestroy($img192);
echo "✓ pwa-192.png\n";

// --- 512x512 ---
$img512 = makeIcon($src, $srcW, $srcH, 512);
imagepng($img512, "$publicDir/pwa-512.png");
imagedestroy($img512);
echo "✓ pwa-512.png\n";

// --- 512x512 maskable (con safe zone padding del 10%) ---
$imgMask = makeIcon($src, $srcW, $srcH, 512, (int)(512 * 0.10));
imagepng($imgMask, "$publicDir/pwa-512-maskable.png");
imagedestroy($imgMask);
echo "✓ pwa-512-maskable.png\n";

// --- favicon.ico (32x32 PNG embebido en contenedor ICO) ---
$img32 = makeIcon($src, $srcW, $srcH, 32);
ob_start();
imagepng($img32);
$pngData = ob_get_clean();
imagedestroy($img32);

$ico = fopen("$publicDir/favicon.ico", 'wb');
// ICONDIR: reserved(2), type(2), count(2)
fwrite($ico, pack('vvv', 0, 1, 1));
// ICONDIRENTRY: width(1), height(1), palette(1), reserved(1),
// planes(2), bpp(2), size(4), offset(4)
fwrite($ico, pack('CCCCvvVV',
    32, 32, 0, 0, 1, 32, strlen($pngData), 22));
fwrite($ico, $pngData);
fclose($ico);
echo "✓ favicon.ico\n";

// --- favicon.svg (logo embebido como base64 para que sea autocontenido) ---
$logoBase64 = base64_encode(file_get_contents($logoPath));
$svg = <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#16a34a"/>
  <image href="data:image/png;base64,{$logoBase64}" x="32" y="32" width="448" height="448" preserveAspectRatio="xMidYMid meet"/>
</svg>
SVG;
file_put_contents("$publicDir/favicon.svg", $svg);
echo "✓ favicon.svg\n";

imagedestroy($src);
echo "\nIconos generados en public/\n";