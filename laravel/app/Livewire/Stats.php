<?php

namespace App\Livewire;

use App\Models\Visit;
use Livewire\Component;

class Stats extends Component
{
    public int $total = 0;
    public int $today = 0;
    public int $unique = 0;

    public function mount(): void
    {
        $this->load();
    }

    public function load(): void
    {
        $this->total = Visit::count();
        $this->today = Visit::whereDate('created_at', today())->count();
        $this->unique = Visit::distinct()->count('ip');
    }

    public function render()
    {
        return view('livewire.stats');
    }
}
