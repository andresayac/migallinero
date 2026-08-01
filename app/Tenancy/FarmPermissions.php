<?php

namespace App\Tenancy;

/**
 * Matriz de permisos por rol dentro de una granja.
 *
 * Los roles viven en la tabla pivote `farm_user`:
 *  - admin:    todo, incluido borrar y anular.
 *  - vendedor: vende, cobra y gestiona clientes; lee el resto.
 *  - operario: registra la operación diaria (huevos, alimento, gallinas,
 *              vacunas, novedades); no toca dinero ni catálogos.
 *
 * Nadie puede borrar salvo el admin: en una granja los registros se anulan
 * (status = void) para conservar el rastro, no se eliminan.
 */
class FarmPermissions
{
    /** Entidades que puede escribir cada rol (crear y actualizar). */
    private const WRITE = [
        'admin' => ['*'],
        'vendedor' => ['sales', 'payments', 'customers'],
        'operario' => ['egg_collections', 'chicken_movements', 'feed_records', 'vaccines', 'incidents'],
    ];

    /** Entidades que puede borrar cada rol. */
    private const DELETE = [
        'admin' => ['*'],
        'vendedor' => [],
        'operario' => [],
    ];

    /** Catálogos: sólo el admin los modifica. */
    private const CATALOGS = [
        'pens', 'egg_categories', 'presentations', 'mortality_causes', 'feed_types',
    ];

    public static function canRead(?string $role, string $entity): bool
    {
        // Cualquier miembro activo de la granja puede leer sus datos: los
        // reportes y el inventario son información compartida del negocio.
        return $role !== null;
    }

    public static function canWrite(?string $role, string $entity): bool
    {
        if ($role === null) {
            return false;
        }

        if (in_array($entity, self::CATALOGS, true)) {
            return $role === 'admin';
        }

        return self::allows(self::WRITE, $role, $entity);
    }

    public static function canDelete(?string $role, string $entity): bool
    {
        return self::allows(self::DELETE, $role, $entity);
    }

    /**
     * Registrar con fecha fuera de la ventana del candado de período requiere
     * ser admin de la granja.
     */
    public static function canOverridePeriodLock(?string $role): bool
    {
        return $role === 'admin';
    }

    private static function allows(array $matrix, ?string $role, string $entity): bool
    {
        $allowed = $matrix[$role] ?? [];

        return in_array('*', $allowed, true) || in_array($entity, $allowed, true);
    }
}
