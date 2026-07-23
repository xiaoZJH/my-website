<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Post extends Model
{
    protected $fillable = ['slug', 'title', 'excerpt', 'body', 'cover', 'tags', 'reading_min'];

    protected $casts = [
        'reading_min' => 'integer',
    ];
}
