<?php

namespace App\Tenancy;

/**
 * Resuelve la granja activa de la petición en curso.
 *
 * El middleware `EnsureActiveFarm` lee la cabecera `X-Farm-Id`, valida que el
 * usuario autenticado tenga acceso, y registra el id y su rol aquí mediante
 * `activate()`. El trait `BelongsToFarm` consume el id automáticamente al
 * construir consultas y crear modelos; `EnsureFarmRole` consume el rol.
 */
class ActiveFarmResolver
{
    protected ?int $farmId = null;

    protected ?string $role = null;

    public function activate(int $farmId, ?string $role = null): void
    {
        $this->farmId = $farmId;
        $this->role = $role;
    }

    public function clear(): void
    {
        $this->farmId = null;
        $this->role = null;
    }

    public function id(): ?int
    {
        return $this->farmId;
    }

    public function role(): ?string
    {
        return $this->role;
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    /**
     * Ejecuta un callback con otra granja activa y restaura el contexto previo.
     * Útil en comandos y jobs, donde no corre el middleware.
     */
    public function withFarm(int $farmId, callable $callback, ?string $role = 'admin'): mixed
    {
        $previousId = $this->farmId;
        $previousRole = $this->role;

        $this->activate($farmId, $role);

        try {
            return $callback();
        } finally {
            $this->farmId = $previousId;
            $this->role = $previousRole;
        }
    }
}
