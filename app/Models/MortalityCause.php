<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['name', 'active', 'sort', 'local_uuid'])]
class MortalityCause extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = [
        'active' => 'boolean',
        'sort' => 'integer',
    ];
}
