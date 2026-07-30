<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['name', 'color', 'active', 'sort', 'local_uuid'])]
class Pen extends Model
{
    use Concerns\BelongsToFarm;

    protected $casts = ['active' => 'boolean', 'sort' => 'integer'];
}
