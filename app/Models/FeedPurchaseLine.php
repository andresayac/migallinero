<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'feed_type_id', 'feed_type_name', 'bags', 'kg_per_bag', 'unit_cost', 'subtotal',
])]
class FeedPurchaseLine extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = [
        'bags' => 'integer',
        'kg_per_bag' => 'decimal:2',
        'unit_cost' => 'integer',
        'subtotal' => 'integer',
    ];

    public function purchase(): BelongsTo
    {
        return $this->belongsTo(FeedPurchase::class, 'feed_purchase_id');
    }

    public function feedType(): BelongsTo
    {
        return $this->belongsTo(FeedType::class);
    }
}
