<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'type', 'pen_id', 'description', 'severity', 'status', 'solved_at',
    'local_uuid', 'entry_mode', 'manual_reason',
])]
class Incident extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = [
        'solved_at' => 'datetime',
    ];

    public function pen(): BelongsTo
    {
        return $this->belongsTo(Pen::class);
    }
}
