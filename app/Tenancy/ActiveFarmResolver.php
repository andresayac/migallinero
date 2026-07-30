<?php

namespace App\Tenancy;

/**
 * Resuelve la granja activa de la petición en curso.
 *
 * El middleware `EnsureUserBelongsToFarm` lee la cabecera `X-Farm-Id` (o el
 * query/atributo de ruta), valida que el usuario autenticado tenga acceso, y
 * registra el id aquí mediante `activate()`. El trait `BelongsToFarm` lo
 * consume automáticamente al construir consultas y crear modelos.
 */
class ActiveFarmResolver
{
    protected ?int $farmId = null;

    public function activate(int $farmId): void
    {
        $this->farmId = $farmId;
    }

    public function clear(): void
    {
        $this->farmId = null;
    }

    public function id(): ?int
    {
        return $this->farmId;
    }
}
