<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'purchased_at', 'supplier', 'observation',
    'total_bags', 'total_qty', 'total_cost', 'local_uuid',
    'entry_mode', 'manual_reason',
])]
class FeedPurchase extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = [
        'purchased_at' => 'datetime',
        'total_bags' => 'integer',
        // Bultos × kg por bulto rara vez es entero (2 × 40,5 = 81).
        'total_qty' => 'decimal:2',
        'total_cost' => 'integer',
    ];

    public function lines(): HasMany
    {
        return $this->hasMany(FeedPurchaseLine::class);
    }
}
