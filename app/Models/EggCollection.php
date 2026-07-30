<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'pen_id', 'collection_at', 'observation', 'total', 'local_uuid',
    'entry_mode', 'manual_reason',
])]
class EggCollection extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = [
        'collection_at' => 'datetime',
        'total' => 'integer',
    ];

    public function pen(): BelongsTo
    {
        return $this->belongsTo(Pen::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(EggCollectionLine::class);
    }
}
