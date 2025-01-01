// Dither pattern generator by Michael Homer 2024, 2025
/**
 * Produce an 8x8 dither pattern for a given colour, using the algorithm from
 * US Patent 5485558 used in Windows 3.
 * @param {number | string} r  red component 0-255, or #RRGGBB hex string
 * @param {number} [g]  green component 0-255; sets px if given when r is string
 * @param {number} [b]  blue component 0-255
 * @param {number} [px=1] size of dither pixels in pixels
 * @returns {string} data url of an 8x8 dithered image of the colour
 */
export function dither(r, g, b, px=1) {
    let swapRB = false, swapGB = false, swapRG = false;

    if (typeof r == 'string' && r[0] == '#' && r.length == 7) {
        const hex = r;
        if (g)
            px = g;
        r = Number.parseInt(hex.substring(1,3), 16);
        g = Number.parseInt(hex.substring(3,5), 16);
        b = Number.parseInt(hex.substring(5,7), 16);
    }
    // compute symmetry
    // This maps the RGB values into tetrahedral space 0, with r >= g >= b.
    if (r < b) {
        [r, b] = [b, r];
        swapRB = true;
    }
    if (g < b) {
        [g, b] = [b, g];
        swapGB = true;
    }
    if (r < g) {
        [r, g] = [g, r];
        swapRG = true;
    }

    let subspace = computeSubspace(r, g, b);
    
    r = scale(r);
    g = scale(g);
    b = scale(b);

    let [c1, c2, c3] = computeTransform(subspace, r, g, b);

    let cc = makeColourCntTable(subspace, c1, c2, c3);

    cc = computePColour(cc, swapRB, swapGB, swapRG);

    cc = sortColourCntTable(cc);

    let output = makeDitherBitmap(cc);

    let canvas = document.createElement('canvas');
    canvas.width = 8 * px;
    canvas.height = 8 * px;
    let ctx = canvas.getContext('2d');

    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            let ibgr = output[x + y * 8];
            ctx.fillStyle = palette[ibgr];
            ctx.fillRect(x * px, y * px, px, px);
        }
    }
    return canvas.toDataURL();
}
export default dither;

/**
 * Produce an 8x8 dither pattern for a given colour, using the algorithm from
 * US Patent 5485558 used in Windows 3.
 * @param {number | string} r  red component 0-255, or #RRGGBB hex string
 * @param {number} [g]  green component 0-255; ignored if r is string
 * @param {number} [b]  blue component 0-255; ignored if r is string
 * @returns {string[][]} row-major 8x8 matrix of hex colours
 */
export function matrix(r, g, b) {
    let swapRB = false, swapGB = false, swapRG = false;

    if (typeof r == 'string' && r[0] == '#' && r.length == 7) {
        const hex = r;
        r = Number.parseInt(hex.substring(1,3), 16);
        g = Number.parseInt(hex.substring(3,5), 16);
        b = Number.parseInt(hex.substring(5,7), 16);
    }
    // compute symmetry
    // This maps the RGB values into tetrahedral space 0, with r >= g >= b.
    if (r < b) {
        [r, b] = [b, r];
        swapRB = true;
    }
    if (g < b) {
        [g, b] = [b, g];
        swapGB = true;
    }
    if (r < g) {
        [r, g] = [g, r];
        swapRG = true;
    }

    let subspace = computeSubspace(r, g, b);
    
    r = scale(r);
    g = scale(g);
    b = scale(b);

    let [c1, c2, c3] = computeTransform(subspace, r, g, b);

    let cc = makeColourCntTable(subspace, c1, c2, c3);

    cc = computePColour(cc, swapRB, swapGB, swapRG);

    cc = sortColourCntTable(cc);

    let output = makeDitherBitmap(cc);

    let matrix = [[],[],[],[],[],[],[],[]];
    for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
            let ibgr = output[x + y * 8];
            matrix[y][x] = palette[ibgr];
        }
    }
    return matrix;
}

/**
 * The 16-colour palette used in the dithering algorithm,
 * in ascending IBGR order.
 * Slot 8 is unused.
 * @type {string[]} Array of 16 colours in hex format
 */
const palette = [
    "#000000", "#800000", "#008000", "#808000",
    "#000080", "#800080", "#008080", "#808080",
    "#123456", "#ff0000", "#00ff00", "#ffff00",
    "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
]

/**
 * Find which tetrahedral subspace of space 0 this RGB value is in.
 * 
 * It is in subspace 0 if r - 128 <= 0
 *          subspace 1 if r - 128 + g - 128 <= 0,
 *          subspace 2 if r - 128 + b - 128 <= 0
 * or else  subspace 3.
 * 
 * The subspaces are determined by the following IBGR coordinates:
 *   0: 0, 1, 3, 7
 *   1: 1, 3, 7, 9
 *   2: 3, 7, 9, 11
 *   3: 7, 9, 11, 15
 * @param {number} r 
 * @param {number} g 
 * @param {number} b 
 * @returns {number} 0-3
 */
function computeSubspace(r, g, b) {
    if (r - 128 < 0)
        return 0;
    if (r - 128 + g - 128 < 0)
        return 1;
    if (r - 128 + b - 128 < 0)
        return 2;
    return 3;
}

/**
 * Scale a component from 0-255 to 0-64
 * @param {number} a A value from 0-255
 * @returns {number} A value from 0-64
 */
function scale(a) {
    return ((Math.floor(a / 2) + a % 2) / 2) | 0;
}

/**
 * Calculate the number of pixels of each colour in the 4-colour palette
 * to use to represent the given RGB value in this subspace.
 * 
 * Subspace 3 uses origin (64, 0, 0) and the others use (32, 32, 0),
 * and the input coordinates are transformed into that space and then
 * multiplied by a matrix to get the number of pixels of each colour.
 * Closer colours will have more pixels.
 * @param {number} subspace Subspace number 0-3
 * @param {number} r component 0-64
 * @param {number} g component 0-64
 * @param {number} b component 0-64
 * @returns {number[]} Three values representing the count of pixels of the vertex colours of the subspace
 */
function computeTransform(subspace, r, g, b) {
    const matrices = [
        [
            [-2, 0, 0],
            [2, -2, 0],
            [0, 0, 2],
        ],
        [
            [-2, -2, 0],
            [2, 0, 0],
            [0, 0, 2]
        ],
        [
            [1, -1, 0],
            [1, 1, 0],
            [0, 0, 2]
        ],
        [
            [-2, 0, 0],
            [0, 1, -1],
            [1, 0, 1]
        ]
    ];

    if (subspace == 3) {
        r -= 64;
    } else {
        r -= 32;
        g -= 32;
    }

    let matrix = matrices[subspace];

    let c1 = r * matrix[0][0] +
             g * matrix[0][1] +
             b * matrix[0][2];
    let c2 = r * matrix[1][0] +
             g * matrix[1][1] +
             b * matrix[1][2];
    let c3 = r * matrix[2][0] +
             g * matrix[2][1] +
             b * matrix[2][2];
    return [c1, c2, c3];
}

/**
 * Produce a table of colours and their counts to use in the dither pattern.
 * The table may contain 1-4 colours, determined by the subspace,
 * and the counts are the number of pixels provided.
 * 
 * @param {number} subspace The subspace number 0-3
 * @param {number} c1 How many pixels of colour 1
 * @param {number} c2 How many pixels of colour 2
 * @param {number} c3 How many pixels of colour 3
 * @returns {ColourCount[]} Array of colours and their pixel counts
 */
function makeColourCntTable(subspace, c1, c2, c3) {
    const colours = [
        [0x03, 0x00, 0x01, 0x07],
        [0x03, 0x01, 0x09, 0x07],
        [0x03, 0x09, 0x0b, 0x07],
        [0x09, 0x07, 0x0b, 0x0f]
    ]
    let j = -1;
    let cc = [{colour: 0, count: 0}, {colour: 0, count: 0}, {colour: 0, count: 0}, {colour: 0, count: 0}];
    if (64 != c1 + c2 + c3) {
        j++;
        cc[j].colour = colours[subspace][0];
        cc[j].count = 64 - c1 - c2 - c3;
    }
    if (c1 != 0) {
        j++;
        cc[j].colour = colours[subspace][1];
        cc[j].count = c1;
    }
    if (c2 != 0) {
        j++;
        cc[j].colour = colours[subspace][2];
        cc[j].count = c2;
    }
    if (c3 != 0) {
        j++;
        cc[j].colour = colours[subspace][3];
        cc[j].count = c3;
    }
    cc.splice(j + 1);
    return cc
}

/**
 * Transform the colours in the table back to the original space,
 * swapping colours to reverse the symmetry transformation.
 * @param {ColourCount[]} cc colour count table produced by makeColourCntTable
 * @param {boolean} swapRB whether the red/blue components were swapped
 * @param {boolean} swapGB whether the green/blue components were swapped
 * @param {boolean} swapRG whether the red/green components were swapped
 * @returns {ColourCount[]} table with colours transformed
 */
function computePColour(cc, swapRB, swapGB, swapRG) {
    for (let i = 0; i < cc.length; i++) {
        let temp = cc[i].colour;
        
        let r = (temp & 0x01);
        let g = (temp & 0x02) >> 1;
        let b = (temp & 0x04) >> 2;
        if (swapRG) {
            [r, g] = [g, r];
        }
        if (swapGB) {
            [g, b] = [b, g];
        }
        if (swapRB) {
            [r, b] = [b, r];
        }
        temp = b << 2 | g << 1 | r | (cc[i].colour & 0x08);
        cc[i].colour = temp;
    }
    return cc;
}

/**
 * Sort the colour count table by intensity of the colours,
 * using a pre-specified order of colours.
 * @param {ColourCount[]} cc 
 * @returns {ColourCount[]} table sorted in increasing order of intensity
 */
function sortColourCntTable(cc) {
    const PColourIntensities =
        [1, 3, 4, 7, 2, 5, 6, 8, -1, 10, 11, 14, 9, 12, 13, 15];
    cc.sort((a, b) => PColourIntensities[a.colour] - PColourIntensities[b.colour]);
    return cc;
}

/**
 * Place the colours into the preset dither pattern, filling in the
 * least intense colours first.
 * @param {ColourCount[]} cc colour count table
 * @returns {number[]} 64-entry array of colours, row-major order
 */
function makeDitherBitmap(cc) {
    const pattern = [
        0,  32, 8,  40, 2,  34, 10, 42,
        48, 16, 56, 24, 50, 18, 58, 26,
        12, 44, 4,  36, 14, 46, 6,  38,
        60, 28, 52, 20, 62, 30, 54, 22,
        3,  35, 11, 43, 1,  33, 9,  41,
        51, 19, 59, 27, 49, 17, 57, 25,
        15, 47, 7,  39, 13, 45, 5,  37,
        63, 31, 55, 23, 61, 29, 53, 21
    ]
    let output = new Array(64).fill(0);
    let current_count = 0;
    let prev_pattern = new Array(64).fill(false);

    for (let i = 0; i < cc.length; i++) {
        current_count += cc[i].count;
        for (let j = 0; j < 64; j++) {
            if (current_count > pattern[j] && !prev_pattern[j]) {
                output[j] = cc[i].colour;
                prev_pattern[j] = true;
            }
        }
    }
    return output;
}


/**
 * Create a set of comparison swatches with solid colours
 * and their dithered counterparts, and add them to the document.
 * Produces one for each possible colour spaced 32 apart in
 * each component.
 */
export function createComparisonSwatches() {
    for (let r = 0; r <= 256; r += 32) {
        for (let g = 0; g <= 256; g += 32) {
            for (let b = 0; b <= 256; b += 32) {
                r = Math.min(r, 255);
                g = Math.min(g, 255);
                b = Math.min(b, 255);
                let dith = dither(r, g, b);
                let solid = document.createElement('div');
                solid.style.width = '10vw';
                solid.style.height = '10vh';
                solid.style.background = `rgb(${r}, ${g}, ${b})`;
                let pattern = document.createElement('div');
                pattern.style.width = '10vw';
                pattern.style.height = '10vh';
                pattern.style.background = 'url("' + dith + '")';
                solid.style.display = 'inline-block';
                pattern.style.display = 'inline-block';
                document.body.append(solid);
                document.body.append(pattern);
                document.body.append(document.createElement('br'));
            }
        }
    }
}



// This is the example from the patent
//dither(128, 31, 190)


/**
 * A paired colour and count for the count table.
 * @typedef {{colour: number, count: number}} ColourCount
 */
