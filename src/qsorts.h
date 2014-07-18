#ifndef QSORTS_H
#define QSORTS_H

#ifndef __USE_GNU
typedef int (*__compar_d_fn_t) (const void *, const void *, void *);
#endif

typedef void (*__swap_d_fn_t) (void *, void *, void *);

void
qsorts_r (void *const pbase, size_t total_elems, size_t size,
	  __compar_d_fn_t cmp, __swap_d_fn_t swap, void *arg);
void qsorts_alt_r(void *ptr, size_t count, size_t size,
		  __compar_d_fn_t compare, __swap_d_fn_t swap, void *arg);

#endif
