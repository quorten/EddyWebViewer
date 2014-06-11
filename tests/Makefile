CPP = cpp
cjs_dir = ../libs/cjs
SOURCES = cttest.js tl.js sl.js
BUNDLES = cttest.b.js tl.b.js sl.b.js
CPATH = ../src

all: $(BUNDLES)

include $(cjs_dir)/cjs.mak

cttest.b.js: cttest.hjs
	$(cjs_dir)/hjssmash.sh $< -o $@

tl.b.js: tl.hjs
	$(cjs_dir)/hjssmash.sh $< -o $@

sl.b.js: sl.hjs
	$(cjs_dir)/hjssmash.sh $< -o $@

clean::
	rm -f $(BUNDLES)
