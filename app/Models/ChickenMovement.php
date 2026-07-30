<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'pen_id', 'type', 'qty', 'reason', 'observation', 'photo_path',
    'movement_at', 'local_uuid', 'entry_mode', 'manual_reason',
])]
class ChickenMovement extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = [
        'movement_at' => 'datetime',
        'qty' => 'integer',
    ];

    public function pen(): BelongsTo
    {
        return $this->belongsTo(Pen::class);
    }
}
