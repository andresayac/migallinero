<?php

namespace App\Models\Concerns;

use App\Tenancy\ActiveFarmResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Trait para aislar los modelos operativos por granja.
 *
 * - Global scope automático: toda consulta añade `WHERE farm_id = activeFarm`.
 * - Al crear, rellena `farm_id` si no viene seteado.
 * - Expone la relación `farm()` y helper `scopeForFarm()`.
 */
trait BelongsToFarm
{
    public static function bootBelongsToFarm(): void
    {
        static::addGlobalScope('farm', function (Builder $builder) {
            $farmId = app(ActiveFarmResolver::class)->id();
            if ($farmId !== null) {
                $builder->where($builder->qualifyColumn('farm_id'), $farmId);
            }
        });

        static::creating(function (Model $model) {
            $farmId = app(ActiveFarmResolver::class)->id();
            if ($model->farm_id === null && $farmId !== null) {
                $model->farm_id = $farmId;
            }
        });
    }

    public function farm(): BelongsTo
    {
        return $this->belongsTo(Farm::class);
    }

    /** Consulta sin aplicar el scope (uso administrativo interno). */
    public function scopeForFarm(Builder $builder, int $farmId): Builder
    {
        return $builder->withoutGlobalScope('farm')->where('farm_id', $farmId);
    }
}
