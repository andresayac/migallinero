<?php

namespace App\Tenancy;

use App\Models\Farm;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * Candado de período, validado EN EL SERVIDOR.
 *
 * El cliente ya avisa al usuario, pero esa comprobación es sólo de interfaz:
 * cualquiera puede llamar a la API directamente. Como el objetivo del candado
 * es evitar la manipulación de registros viejos, la única validación que
 * cuenta es esta.
 *
 * Reglas:
 *  - Nunca se admiten fechas futuras (no se anticipa producción).
 *  - Hacia atrás se admite hasta `farms.period_lock_days`.
 *  - Más atrás sólo un admin de la granja, y debe dar un motivo.
 */
class PeriodLock
{
    private ?Farm $farm = null;

    private bool $farmLoaded = false;

    public function __construct(private ActiveFarmResolver $resolver) {}

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<int, string>  $dateFields
     *
     * @throws ValidationException
     */
    public function assert(array $payload, array $dateFields): void
    {
        foreach ($dateFields as $field) {
            if (! array_key_exists($field, $payload) || $payload[$field] === null) {
                continue;
            }

            $this->assertDate($field, $payload[$field], $payload['manual_reason'] ?? null);
        }
    }

    private function assertDate(string $field, mixed $value, ?string $manualReason): void
    {
        try {
            $date = Carbon::parse((string) $value);
        } catch (\Throwable) {
            throw ValidationException::withMessages([
                $field => ['La fecha no es válida.'],
            ]);
        }

        $timezone = $this->farmTimezone();
        $today = Carbon::now($timezone)->startOfDay();
        $target = $date->copy()->setTimezone($timezone)->startOfDay();

        if ($target->greaterThan($today)) {
            throw ValidationException::withMessages([
                $field => ['No se puede registrar con una fecha futura.'],
            ]);
        }

        $lockDays = $this->lockDays();
        $earliest = $today->copy()->subDays($lockDays);

        if ($target->greaterThanOrEqualTo($earliest)) {
            return;
        }

        if (! FarmPermissions::canOverridePeriodLock($this->resolver->role())) {
            throw ValidationException::withMessages([
                $field => ["La fecha tiene más de {$lockDays} días. Sólo un administrador puede autorizarla."],
            ]);
        }

        if (trim((string) $manualReason) === '') {
            throw ValidationException::withMessages([
                'manual_reason' => ['Debes indicar el motivo para registrar una fecha fuera del período permitido.'],
            ]);
        }
    }

    public function lockDays(): int
    {
        return (int) ($this->farm()?->period_lock_days ?? 7);
    }

    public function farmTimezone(): string
    {
        $timezone = $this->farm()?->timezone;

        return $this->isValidTimezone($timezone) ? $timezone : 'UTC';
    }

    /** Inicio del día de HOY en la zona horaria de la granja, en UTC. */
    public function startOfToday(): CarbonInterface
    {
        return Carbon::now($this->farmTimezone())->startOfDay();
    }

    private function farm(): ?Farm
    {
        if (! $this->farmLoaded) {
            $this->farmLoaded = true;
            $id = $this->resolver->id();
            $this->farm = $id === null ? null : Farm::find($id);
        }

        return $this->farm;
    }

    private function isValidTimezone(?string $timezone): bool
    {
        return $timezone !== null && in_array($timezone, timezone_identifiers_list(), true);
    }
}
