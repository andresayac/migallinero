<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'name', 'owner_name', 'phone', 'country', 'timezone', 'locale',
    'currency', 'period_lock_days', 'active',
])]
class Farm extends Model
{
    protected $casts = [
        'period_lock_days' => 'integer',
        'active' => 'boolean',
    ];

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class)
            ->withPivot(['role', 'active', 'joined_at'])
            ->using(FarmUser::class)
            ->withTimestamps();
    }

    public function pens(): HasMany
    {
        return $this->hasMany(Pen::class);
    }

    public function eggCategories(): HasMany
    {
        return $this->hasMany(EggCategory::class);
    }

    public function presentations(): HasMany
    {
        return $this->hasMany(Presentation::class);
    }

    public function mortalityCauses(): HasMany
    {
        return $this->hasMany(MortalityCause::class);
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class);
    }

    public function eggCollections(): HasMany
    {
        return $this->hasMany(EggCollection::class);
    }

    public function chickenMovements(): HasMany
    {
        return $this->hasMany(ChickenMovement::class);
    }
}
