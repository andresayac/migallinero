<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'egg_category_id', 'presentation_id', 'qty_packs', 'qty_units',
    'unit_price', 'subtotal',
])]
class SaleLine extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = [
        'qty_packs' => 'float',
        'qty_units' => 'integer',
        'unit_price' => 'integer',
        'subtotal' => 'integer',
    ];

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }
}
