/* Copyright (C) 1991,1992,1996,1997,1999,2004 Free Software Foundation, Inc.
   This file originated from the GNU C Library.
   Written by Douglas C. Schmidt (schmidt@ics.uci.edu).
   Modified by Andrew Makousky to allow for a custom swap function.

   The GNU C Library is free software; you can redistribute it and/or
   modify it under the terms of the GNU Lesser General Public
   License as published by the Free Software Foundation; either
   version 2.1 of the License, or (at your option) any later version.

   The GNU C Library is distributed in the hope that it will be
   useful, but WITHOUT ANY WARRANTY; without even the implied warranty
   of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU Lesser General Public License in the file named "COPYING.LIB"
   for more details.

   You should have received a copy of the GNU Lesser General Public
   License along with this software; if not, write to the Free
   Software Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA
   02111-1307 USA.  */
#ifndef QSORTS_H
#define QSORTS_H

#ifndef CHAR_BIT
#define CHAR_BIT 8 /* Assuming that we can't do better and use autoconf... */
#endif

#ifndef __USE_GNU
typedef int (*__compar_d_fn_t) (const void *, const void *, void *);
#endif

typedef void (*__swap_d_fn_t) (void *, void *, void *);


/* Stack node declarations used to store unfulfilled partition obligations. */
typedef struct
  {
    char *lo;
    char *hi;
  } qs_stack_node;

/* The next 4 #defines implement a very fast in-line stack abstraction. */
/* The stack needs log (total_elements) entries (we could even subtract
   log(MAX_THRESH)).  Since total_elements has type size_t, we get as
   upper bound for log (total_elements):
   bits per byte (CHAR_BIT) * sizeof(size_t).  */
#define QS_STACK_SIZE	   (CHAR_BIT * sizeof(size_t))
#define QS_PUSH(low, high) \
  ((void) ((top->lo = (low)), (top->hi = (high)), ++top))
#define	QS_POP(low, high) \
  ((void) (--top, (low = top->lo), (high = top->hi)))
#define	QS_STACK_NOT_EMPTY (stack < top)


void
qsorts_r (void *const pbase, size_t total_elems, size_t size,
	  __compar_d_fn_t cmp, __swap_d_fn_t swap, void *arg);
void qsorts_alt_r(void *ptr, size_t count, size_t size,
		  __compar_d_fn_t compare, __swap_d_fn_t swap, void *arg);

#endif
