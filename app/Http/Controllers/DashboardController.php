<?php

namespace App\Http\Controllers;

use App\Models\ChickenMovement;
use App\Models\EggCollection;
use App\Models\Sale;
use App\Models\Vaccine;
use App\Tenancy\PeriodLock;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Métricas del resumen del Home, filtradas por la granja activa
 * (el middleware `active.farm` y el trait `BelongsToFarm` se encargan).
 *
 * Opcionalmente recibe `?pen=` para filtrar por galpón.
 */
class DashboardController extends Controller
{
    public function __construct(private PeriodLock $periodLock) {}

    public function summary(Request $request)
    {
        $validated = $request->validate([
            'pen' => ['sometimes', 'nullable', 'integer', 'min:1'],
        ]);

        $penId = $validated['pen'] ?? null;

        // "Hoy" es hoy en la zona horaria de LA GRANJA, no del servidor. Con
        // config('app.timezone') = UTC, en Colombia (UTC-5) el día arrancaba a
        // las 19:00 del día anterior y el conteo de huevos salía inflado.
        $startOfDay = $this->periodLock->startOfToday();

        $todayEggs = EggCollection::query()
            ->when($penId, fn ($q) => $q->where('pen_id', $penId))
            ->where('collection_at', '>=', $startOfDay)
            ->sum('total');

        // Mismo criterio que el cliente: cualquier venta no anulada con saldo.
        $pendingDebt = Sale::query()
            ->where('status', '!=', 'void')
            ->where('balance', '>', 0)
            ->sum('balance');

        $nextVaccine = Vaccine::query()
            ->when($penId, fn ($q) => $q->where('pen_id', $penId))
            ->whereNotNull('next_at')
            ->where('next_at', '>=', $startOfDay)
            ->orderBy('next_at')
            ->first();

        // Una vacuna cuya fecha ya pasó es justo la que hay que avisar.
        $overdueVaccine = Vaccine::query()
            ->when($penId, fn ($q) => $q->where('pen_id', $penId))
            ->whereNotNull('next_at')
            ->where('next_at', '<', $startOfDay)
            ->orderByDesc('next_at')
            ->first();

        return response()->json([
            'today_eggs' => (int) $todayEggs,
            'alive_chickens' => $this->aliveChickens($penId),
            'pending_debt' => (int) $pendingDebt,
            'next_vaccine' => $nextVaccine,
            'overdue_vaccine' => $overdueVaccine,
            'timezone' => $this->periodLock->farmTimezone(),
        ]);
    }

    /**
     * Gallinas vivas = buy + birth + adjust(+) - death - sale - revoke.
     *
     * `adjust` puede ser positivo o negativo (la columna qty es signed), así que
     * se suma tal cual; `transfer` es interno entre galpones y no altera el
     * total de la granja, aunque sí el de un galpón concreto.
     */
    protected function aliveChickens(?int $penId): int
    {
        $rows = ChickenMovement::query()
            ->when($penId, fn ($q) => $q->where('pen_id', $penId))
            ->selectRaw('type, COALESCE(SUM(qty),0) AS total')
            ->groupBy('type')
            ->pluck('total', 'type');

        $delta =
            $rows->get('buy', 0)
            + $rows->get('birth', 0)
            + $rows->get('adjust', 0)
            - $rows->get('death', 0)
            - $rows->get('sale', 0)
            - $rows->get('revoke', 0);

        if ($penId !== null) {
            $delta += $rows->get('transfer', 0);
        }

        return max(0, (int) $delta);
    }
}
