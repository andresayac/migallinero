<?php

namespace App\Http\Controllers;

use App\Models\ChickenMovement;
use App\Models\EggCollection;
use App\Models\Sale;
use App\Models\Vaccine;
use Illuminate\Http\Request;

/**
 * Métricas para el resumen del Home, filtradas por la granja activa
 * (el middleware `active.farm` y el trait `BelongsToFarm` se encargan).
 *
 * Opcionalmente recibe `?pen=` para filtrar por galpón.
 */
class DashboardController extends Controller
{
    public function summary(Request $request)
    {
        $penId = $request->integer('pen');

        $startOfDay = now()->startOfDay();

        $todayEggs = EggCollection::query()
            ->when($penId, fn ($q) => $q->where('pen_id', $penId))
            ->where('collection_at', '>=', $startOfDay)
            ->sum('total');

        $alive = $this->aliveChickens($penId);

        $pendingDebt = Sale::query()
            ->where('status', '!=', 'void')
            ->where('balance', '>', 0)
            ->sum('balance');

        $nextVaccine = Vaccine::query()
            ->when($penId, fn ($q) => $q->where('pen_id', $penId))
            ->where('next_at', '>=', now())
            ->orderBy('next_at')
            ->first();

        return response()->json([
            'today_eggs' => (int) $todayEggs,
            'alive_chickens' => $alive,
            'pending_debt' => (int) $pendingDebt,
            'next_vaccine' => $nextVaccine,
        ]);
    }

    /**
     * Gallinas vivas = buy + birth - death - sale - revoke.
     * Por rendimiento calculado con agregados por tipo.
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
            - $rows->get('death', 0)
            - $rows->get('sale', 0)
            - $rows->get('revoke', 0);

        return max(0, (int) $delta);
    }
}
