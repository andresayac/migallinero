<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'name', 'short', 'sellable', 'is_broken', 'color', 'sort', 'active', 'local_uuid',
])]
class EggCategory extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = [
        'sellable' => 'boolean',
        'is_broken' => 'boolean',
        'sort' => 'integer',
        'active' => 'boolean',
    ];
}
