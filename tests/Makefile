CPP = cpp
cjs_dir = ../libs/cjs
SOURCES = ../src/cothread.js cttest.js
BUNDLES = cttest.b.js

all: $(BUNDLES)

include $(cjs_dir)/cjs.mak

cttest.b.js: cttest.hjs
	$(cjs_dir)/hjssmash.sh $< -o $@

clean::
	rm -f $(BUNDLES)
