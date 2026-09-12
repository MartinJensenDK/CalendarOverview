<?php

namespace App\Services;

/**
 * Generates an SVG avatar with initials and a deterministic colour.
 */
class AvatarService
{
    private const PALETTE = [
        ['#3e63dd', '#ffffff'], ['#12a594', '#ffffff'], ['#e5484d', '#ffffff'], ['#f76b15', '#ffffff'],
        ['#8e4ec6', '#ffffff'], ['#0090ff', '#ffffff'], ['#d6409f', '#ffffff'], ['#46a758', '#ffffff'],
        ['#ab4aba', '#ffffff'], ['#00a2c7', '#ffffff'], ['#ffc53d', '#1c2024'], ['#bdee63', '#1c2024'],
    ];

    public static function color(string $seed): array
    {
        $index = hexdec(substr(md5($seed), 0, 4)) % count(self::PALETTE);

        return self::PALETTE[$index];
    }

    public static function svg(string $seed, string $initials, int $size = 96): string
    {
        [$bg, $fg] = self::color($seed);
        $initials = htmlspecialchars(mb_substr($initials, 0, 2), ENT_QUOTES);
        $fontSize = (int) round($size * 0.42);

        return '<svg xmlns="http://www.w3.org/2000/svg" width="'.$size.'" height="'.$size.'" viewBox="0 0 '.$size.' '.$size.'">'
            .'<rect width="'.$size.'" height="'.$size.'" rx="'.($size / 2).'" fill="'.$bg.'"/>'
            .'<text x="50%" y="50%" dy=".36em" text-anchor="middle" font-family="Inter, system-ui, -apple-system, Segoe UI, sans-serif" font-size="'.$fontSize.'" font-weight="600" fill="'.$fg.'">'.$initials.'</text>'
            .'</svg>';
    }
}
