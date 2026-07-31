<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'feed_type_id', 'feed_type_name', 'qty', 'unit_cost', 'subtotal',
])]
class FeedRecordLine extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = [
        'qty' => 'decimal:2',
        'unit_cost' => 'integer',
        'subtotal' => 'integer',
    ];

    public function record(): BelongsTo
    {
        return $this->belongsTo(FeedRecord::class, 'feed_record_id');
    }

    public function feedType(): BelongsTo
    {
        return $this->belongsTo(FeedType::class);
    }
}
