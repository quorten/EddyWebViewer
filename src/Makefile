CPP = cpp
cjs_dir = ../libs/cjs
SOURCES = cothread.js cttest.js

all: bundle.js docs

include $(cjs_dir)/cjs.mak

bundle.js: cttest.hjs
	$(cjs_dir)/hjssmash.sh $< -o $@

docs:
	../../jsdoc-master/jsdoc triglut.js cothread.js ../README.md -u docs_in
	rm -rf ../docs/jsdocs
	mv out jsdocs
	mv jsdocs ../docs/

clean::
	rm -f bundle.js
