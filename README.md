Generate accurate Windows 3.x dither patterns for any solid colour

    import dither from "./dither.js";
    const dataURI = dither(128, 31, 190);
    element.style.backgroundImage = `url(${dataURI})`;

The dither function takes an additional argument to specify the pixel
size (default 1). The resulting image will be (8 * px)x(8 * px).

Instead of three integer components, a seven-character #abcdef hex
colour specifier can be given as the first argument.

A `matrix` function is also exported, and returns an 8x8 array of hex
colour strings instead of an image.

The algorithm in use is adapted from expired US Patent 5485558, with
some corrections for bugs.

A live tool using this library is accessible at https://mwh.nz/dither/
