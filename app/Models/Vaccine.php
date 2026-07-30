<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'name', 'batch', 'expires_at', 'dose', 'applied_at', 'next_at',
    'pen_id', 'qty_chickens', 'responsible', 'observation', 'photo_path',
    'local_uuid', 'entry_mode', 'manual_reason',
])]
class Vaccine extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = [
        'expires_at' => 'date',
        'applied_at' => 'datetime',
        'next_at' => 'datetime',
        'qty_chickens' => 'integer',
    ];

    public function pen(): BelongsTo
    {
        return $this->belongsTo(Pen::class);
    }
}
