# GNU Make -*- makefile -*- rules for compiling files in projects that
# use cjs.

TARGETS = $(SOURCES:.js=.hjs)

.SUFFIXES:: .c .js .hjs .hjs.d

.c.js:
	$(cjs_dir)/converter <$< >$@

.js.hjs:
	$(cjs_dir)/hjsprep.sh $< -o $@

%.hjs.d: %.hjs $(TARGETS)
	@set -e; rm -f $@; \
	  $(CPP) -M $< > $@; \
	  sed -i -e 's,\($*\)\.hjs,\1.js,g' \
	  -e 's,\($*\)\.o[ :]*,\1.hjs $@ : ,g' $@;

include $(TARGETS:.hjs=.hjs.d)

clean::
	rm -f *.hjs *.hjs.d
