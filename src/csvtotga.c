/* Convert a CSV file to a TGA file with the SSH values manipulated in
   a certian way.

   Usage: PROGNAME <INPUT.dat >OUTPUT.tga

   Data must be 1440x721 in dimensions.

*/

#include <stdio.h>
#include <stdint.h>

int main(int argc, char *argv[]) {
  /* Write the TGA header.  */
  putchar(0); /* ID length */
  putchar(0); /* Color map type */
  putchar(2); /* Image type (True Color) */

  /* No color map specification.  */
  putchar(0); putchar(0); putchar(0); putchar(0); putchar(0);

  { /* Image specification.  */
    uint16_t xorg = 0, yorg = 0, width = 1440, height = 721;
    fwrite(&xorg, sizeof(uint16_t), 1, stdout);
    fwrite(&yorg, sizeof(uint16_t), 1, stdout);
    fwrite(&width, sizeof(uint16_t), 1, stdout);
    fwrite(&height, sizeof(uint16_t), 1, stdout);
    putchar(24); /* Bits per pixel */
    putchar(0); /* Image descriptor */
  }

  {
    float in_val;
    while (scanf("%f", &in_val) != EOF) {
      /* Convert to 24-bit fixed point with 18 bits after the decimal
	 point.  Two's complement negation is dropped in favor of a
	 unsigned linear scale with the median value corresponding to
	 zero.  */
      int bad = 5; /* Bits After Decimal */
      uint32_t out_val = (uint32_t)(in_val * (1 << bad));

      /* I have to try out all the tricks: Simple grayscale encoding,
	 multi-color channel encoding, unsigned integer adjustment,
	 bit threshold display, smooth wrap on range exceed.
	 Mirroring for bounceback boundary at zero level.  MATLAB jet
	 color palette.  */

      /* If the value of the least significant byte exceeds 255 and
	 goes negative, make it wrap from 255 downward to zero rather
	 than wrap directly to zero for visual smoothness.  */
      if (out_val & 0x0100)
	out_val = ~out_val;

      /* Convert to Gray code for better threshold visualization.  */
      /* out_val = (out_val >> 1) ^ out_val;

      if (out_val & 0x80)
	out_val = 0xff;
      else
	out_val = 0; */

      /* Prepare out_val for grayscale display.  */

      /* Shift value zero to be at the middle of the unsigned value
	 range.  */
      /* out_val = (out_val + 0x80) & 0xff; */

      /* Write out the three least significant bytes in network byte
	 order.  */
      putchar(out_val); /* Blue */
      putchar(out_val); /* Green */
      putchar(out_val); /* Red */
      getchar(); /* Ignore the delimeter that follows.  */
    }
  }

  return 0;
}
