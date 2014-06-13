/* Convert a CSV file to a TGA file with the SSH values manipulated in
   a certian way.

   Usage: PROGNAME <INPUT.dat >OUTPUT.tga

   Data must be 1440x721 in dimensions.

*/

#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <netinet/in.h>

int main(int argc, char *argv[]) {
  /* Write the TGA header.  */
  putchar(0); /* ID length */
  putchar(0); /* Color map type (none) */
  putchar(2); /* Image type (True Color) */

  /* No color map specification.  */
  putchar(0); putchar(0); putchar(0); putchar(0); putchar(0);

  { /* Image specification.  16-bit integers are stored in little
       endian.  */
    uint16_t xorg = 0, yorg = 0, width = 1440, height = 721;
#define PUT_SHORT(var) putchar(var & 0xff); putchar((var >> 8) & 0xff)
    PUT_SHORT(xorg);  PUT_SHORT(yorg);
    PUT_SHORT(width * 4); PUT_SHORT(height);
    putchar(8); /* Bits per pixel */
    /* Image descriptor.  When this is just set to zero the first row
       of pixels start at the bottom of the TGA and continue upward.
       Add 32 for top-down TGA.
       Add 8 if there is an 8-bit alpha channel.  */
    putchar(0);
  }

  {
    float in_val;
    while (scanf("%f", &in_val) != EOF) {
      /* Convert to 24-bit fixed point with 18 bits after the decimal
	 point.  Two's complement negation is dropped in favor of a
	 unsigned linear scale with the median value corresponding to
	 zero.  */
      int bad = 5; /* Bits After Decimal */
      /* uint32_t out_val = (uint32_t)(in_val * (1 << bad)); */

      /* Insert the 32-bit floating point number right inside one
	 pixel in the 32-bit TGA image.  */
      uint32_t out_val;
      memcpy(&out_val, &in_val, sizeof(uint32_t));
      out_val = htonl(out_val);

      fwrite(&out_val, sizeof(uint32_t), 1, stdout);
      getchar(); /* Ignore the delimeter that follows.  */
      continue;

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
