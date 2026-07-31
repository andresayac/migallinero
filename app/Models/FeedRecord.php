<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'pen_id', 'recorded_at', 'shift', 'observation',
    'total_qty', 'total_cost', 'local_uuid',
    'entry_mode', 'manual_reason',
])]
class FeedRecord extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = [
        'recorded_at' => 'datetime',
        'total_qty' => 'integer',
        'total_cost' => 'integer',
    ];

    public function pen(): BelongsTo
    {
        return $this->belongsTo(Pen::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(FeedRecordLine::class);
    }
}
