/* Convert a JSON tracks file to the format that is optimized for the
   web viewer.

   Usage: tracksconv TYPE <INPUT >OUTPUT

   TYPE is 0 for a cyclonic tracks JSON and 1 for an acyclonic tracks JSON.
*/

#include <stdio.h>
#include "../libs/cjs/exparray.h"

struct InputEddy_tag {
  float lat; /* Latitude */
  float lon; /* Longitude */
  unsigned date_index;
  unsigned eddy_index;
};
typedef struct InputEddy_tag InputEddy;

struct SortedEddy_tag {
  unsigned type;
  unsigned eddy_index;
  float lat;
  float lon;
  unsigned date_index;
  unsigned unsorted_index;
  unsigned prev; /* zero or index of previous eddy in track */
  unsigned prev_date_index;
  unsigned next; /* zero or index of next eddy in track */
  unsigned next_date_index;
};
typedef struct SortedEddy_tag SortedEddy;

EA_TYPE(InputEddy);
EA_TYPE(InputEddy_array);
EA_TYPE(SortedEddy);

InputEddy_array_array json_input;
SortedEddy_array sorted_eddies;

int main(int argc, char *argv[]) {
  int retval;

  if (argc != 2) {
    fprintf(stderr, "Usage: tracksconv TYPE <INPUT >OUTPUT\n");
    fprintf(stderr, "TYPE is 0 for a cyclonic tracks JSON and 1 "
	    "for an acyclonic tracks JSON.");
    return 1;
  }

  /* Input data format: [ list of tracks ]
     track: [ list of eddies ]
     eddy: [ latitude, longitude, date_index, eddy_index ] */

  { /* Start by reading all of the input data into a data structure in
     memory.  */
    int nest_level = 0;
    /* nest_level == 1: Top-level tracks array
       nest_level == 2: Eddies array within one track
       nest_level == 3: Parameters of one eddy */
    unsigned eddy_param_index = 0;

    scanf("["); nest_level++;
    EA_INIT(InputEddy_array, json_input, 16);
    while (nest_level > 0) {
      int c;
      ungetc(c, stdin);

      if (nest_level == 3) {
	InputEddy_array *cur_track = json_input.d[json_input.len];
	InputEddy *cur_eddy = cur_track->d[cur_track->len];
	switch (eddy_param_index++) {
	case 0: scanf("%f", &cur_eddy->lat); break;
	case 1: scanf("%f", &cur_eddy->lon); break;
	case 2: scanf("%u", &cur_eddy->date_index); break;
	case 3: scanf("%u", &cur_eddy->eddy_index); break;
	}
      }

      c = getchar();
      if (c == ',')
	/* Just skip the separator.  */;
      else if (c == '[') {
	nest_level++;
	if (nest_level == 2)
	  EA_INIT(InputEddy, json_input.d[json_input.len], 16);
	if (nest_level == 3)
	  eddy_param_index = 0;
      } else if (c == ']') {
	if (nest_level == 3)
	  EA_ADD(json_input.d[json_input.len]);
	else if (nest_level == 2)
	  EA_ADD(json_input);
	nest_level--;
      } else {
	fprintf(stderr,
		"Error: Unexpected character found in input: %c\n", c);
	retval = 1; goto cleanup;
      }
    }
  }

  /* Create an array that indexes on eddies rather than tracks.  Each
     eddy will have a pointer to the previous and next eddy in the
     track, or NULL at the beginning or end of the track.  */
  EA_INIT(SortedEddy, sort_eddies);

  { /* Cleanup the JSON input arrays now that we no longer need
       them.  */
    unsigned i;
    for (i = 0; i < json_input.len; i++)
      EA_DESTROY(json_input[i]);
    EA_DESTROY(json_input);
  }

  /* Sort the eddies by date.  */

  /* Find the number of eddies on each date index.  */

  /* Determine the chunk size of the eddy data; that is, the number of
     date indexes per chunk.  */

  /* Build one kd-tree for each chunk of data.  */

  /* No, one kd-tree per date index.  No chunking.  It is up to the
     client to perform top-level kd-tree building.  */

  /* Top-level kd-tree building is unnecessary.  Why?  Because the
     runtime is still O(lg n).  Render linearly more points?  The user
     expectation is linearly longer render time.  It's just a matter
     of changing what the constant in the linear relationship is.
     Chances are that the tree depth per date index will remain
     constant.  */

  /* Convert the eddy previous and next pointers to relative
     indexes.  */

  /* Output the new JSON data.  */

  retval = 0;
 cleanup:
  {
    unsigned i;
    for (i = 0; i < json_input.len; i++)
      EA_DESTROY(json_input[i]);
    EA_DESTROY(json_input);
  }
  EA_DESTROY(sorted_eddies);
  return retval;
}
