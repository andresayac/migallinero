<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'name', 'unit', 'active', 'sort', 'local_uuid',
])]
class FeedType extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = [
        'active' => 'boolean',
        'sort' => 'integer',
    ];
}
