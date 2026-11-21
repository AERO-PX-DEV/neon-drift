// City grid: GRID×GRID blocks; each block = 2×2 lots, roads centred on block edges.
export const BLOCK = 60;
export const ROAD = 16;
export const LOT = (BLOCK - ROAD) / 2;
export const GRID = 32;
export const HALF = (GRID * BLOCK) / 2;
export const roadCoord = (i) => -HALF + i * BLOCK; // road centre line i = 0..GRID
