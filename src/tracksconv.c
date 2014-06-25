/* Convert a JSON tracks file to the format that is optimized for the
   web viewer.

   Usage: tracksconv TYPE <INPUT >OUTPUT

   TYPE is 0 for a cyclonic tracks JSON and 1 for an acyclonic tracks JSON.
*/

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
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
  /* Index of the next eddy in a track.  If this is less than the
     index of the current eddy, then this is the last eddy in this
     track, and the index is pointing to the first eddy in this track
     (for singly-linked lists).  If this is equal to the current eddy,
     then this marks the end of the track (for doubly-linked
     lists).  */
  int next;
  int next_date_index;
  int prev;
  int prev_date_index;
};
typedef struct SortedEddy_tag SortedEddy;

EA_TYPE(InputEddy);
EA_TYPE(InputEddy_array);
EA_TYPE(SortedEddy);
EA_TYPE(unsigned);

InputEddy_array_array json_input;
SortedEddy_array sorted_eddies;
unsigned_array eddies_per_date;

void qsort_eddies_date();

int se_date_cmp(const void *p1, const void *p2);

int main(int argc, char *argv[]) {
  int retval;
  unsigned etype; /* Eddy type */

  if (argc != 2) {
    fprintf(stderr, "Usage: tracksconv TYPE <INPUT >OUTPUT\n");
    fprintf(stderr, "TYPE is 0 for a cyclonic tracks JSON and 1 "
	    "for an acyclonic tracks JSON.");
    return 1;
  }
  etype = atoi(argv[1]);

  EA_INIT(InputEddy_array, json_input, 16);
  EA_INIT(SortedEddy, sorted_eddies, 16);
  EA_INIT(unsigned, eddies_per_date, 16);

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

  { /* Create an array that indexes on eddies rather than tracks.  */
    unsigned i;
    for (i = 0; i < json_input.len; i++) {
      unsigned j;
      for (j = 0; j < json_input.d[i].len; j++) {
	InputEddy *ieddy = json_input.d[i].d[j];
	SortedEddy *seddy = sorted_eddies.d[sorted_eddies.len];
	seddy->type = etype;
	seddy->eddy_index = ieddy->eddy_index;
	seddy->lat = ieddy->lat;
	seddy->lon = ieddy->lon;
	seddy->date_index = ieddy->date_index;
	seddy->unsorted_index = sorted_eddies.len;
	if (j == 0) {
	  seddy->prev = 0;
	  seddy->prev_date_index = 0;
	} else {
	  seddy->prev = sorted_eddies.len - 1;
	  seddy->prev_date_index =
	    sorted_eddies.d[sorted_eddies.len-1].date_index;
	}
	seddy->next = 0;
	seddy->next_date_index = 0;

	/* Initialize the "next" indexes of the previous eddy.  */
	if (sorted_eddies.len > 0 &&
	    j < json_input.d[i].len - 1) {
	  seddy = sorted_eddies.d[sorted_eddies.len-1];
	  seddy->next = sorted_eddies.len;
	  seddy->next_date_index = ieddy->date_index;
	}
	EA_ADD(sorted_eddies);
      }
    }
  }

  { /* Cleanup the JSON input arrays now that we no longer need
       them.  */
    unsigned i;
    for (i = 0; i < json_input.len; i++)
      EA_DESTROY(json_input[i]);
    EA_DESTROY(json_input);
  }

  /* Sort the eddies by date.  We must use our own sort function
     instead of libc qsort() so that the linked lists of eddies are
     preserved.  */
  qsort_eddies_date(sorted_eddies.d, sorted_eddies.len);

  { /* The eddies are now grouped into series of contiguous chunks
       where each date index in the chunk is identical.  Find the
       number of eddies on each date index.  */
    unsigned i;
    unsigned last_date_index = 0;
    unsigned cur_epd = 0; /* Current eddies per date */
    for (i = 0; i < sorted_eddies.len; i++) {
      if (sorted_eddies.d[i].date_index != last_date_index) {
	EA_APPEND(eddies_per_date, cur_epd);
	last_date_index = sorted_eddies.d[i].date_index;
	cur_epd = 0;
      }
      cur_epd++;
    }
    EA_APPEND(eddies_per_date, cur_epd);
  }

  /* Quicksort the eddies by latitude and longitude to prepare for
     kd-tree construction.  */

  { /* Build a 2D kd-tree within each chunk from the latitude and
       longitude of each eddy.  The top node of the kd-tree is stored
       in the middle of the list so that tree traversal takes the same
       form as a bsearch().  */
    unsigned i;
    unsigned j;
    for (i = 0, j = 0; i < eddies_per_date.len; i++) {
      kd_tree();
    }
  }

  { /* Perform two processing algorithms at this step:

       1. Since all of sorting jumbled up the indexes of the eddies,
          the index of the "next" eddy will have to be rematched.
       2. Convert the indexes of the next eddy to relative indexes.
          This translation will likely decrease the number of
          characters in the output JSON (less data to download).  */
    unsigned i;
    for (i = 0; i < sorted_eddies.len; i++) {

      /* Seek to the portion of the data with the date index of the
	 next eddy, then use brute-force sequential search to find
	 where the eddy with the unsorted index is located.  */
      unsigned date_index = sorted_eddies.d[i].next_date_index;
      unsigned frame_start = eddies_per_date.d[date_index];
      unsigned frame_end;
      unsigned j;
      if (date_index < eddies_per_date.len)
	frame_end = eddies_per_date.d[date_index+1];
      else
	frame_end = sorted_eddies.len;
      for (j = frame_start; j < frame_end; j++) {
	if sorted_eddies[j];
	/* TODO FIXME need to keep track of cumulative total.  */
      }

    }
  }

  { /* Output the new JSON data.  */
    unsigned i;

    /* First output the date indexes header.  */
    printf("%10u,\n", eddies_per_date.len);
    for (i = 0; i < eddies_per_date; i++) {
      printf("%10u,", eddies_per_date.d[i]);
      if (i % 4 == 0)
	putchar('\n');
    }
    putchar('\n');

    /* Next output the optimized eddy entries, each record padded to
       the same byte width.  Newlines are written out at regular
       intervals for readability.  */
    for (i = 0; i < sorted_eddies.len - 1; i++) {
      SortedEddy *seddy = sorted_eddies.d[i];
      printf("[%1u,%5u,%10f,%10f,%10i],", seddy->type, seddy->eddy_index,
	     seddy->lat, seddy->lon, seddy->next);
      if (i % 4 == 0)
	putchar('\n');
    }

    { /* Last iteration: no comma at the end of the data.  */
      SortedEddy *seddy = sorted_eddies.d[i];
      printf("[%1u,%5u,%10f,%10f,%10i]", seddy->type, seddy->eddy_index,
	     seddy->lat, seddy->lon, seddy->next);
      putchar('\n');
    }
  }

  retval = 0;
 cleanup:
  {
    unsigned i;
    for (i = 0; i < json_input.len; i++)
      EA_DESTROY(json_input[i]);
    EA_DESTROY(json_input);
  }
  EA_DESTROY(sorted_eddies);
  EA_DESTROY(eddies_per_date);
  return retval;
}

/* `qsort' comparison function for sorting eddy entries based off of
   date.  */
int se_date_cmp(const void *p1, const void *p2) {
  const SortedEddy *se1 = (const SortedEddy*)p1;
  const SortedEddy *se2 = (const SortedEddy*)p2;
  return se1.date_index - se2.date_index;
}
