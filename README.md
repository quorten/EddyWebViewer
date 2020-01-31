EddyWebViewer
=============

This is the source code for the eddy webviewer.  The purpose of this
project is to create a fluid and interactive webviewer to replace our
existing MATLAB viewer
(https://github.com/jfaghm/OceanEddies/tree/master/tracks_viewer)

Most of the Ocean Eddies Web Viewer is licensed under the Expat MIT
license.  See the file COPYING for details.

Build the Website from the Sources
----------------------------------

The only build requirements for the Ocean Eddies Web Viewer is a
working installation of the `make` utility used in C/C++ developer
environments.  GNU Make is preferred.  Using other make
implementations is possible via a few minor changes to the build
system, mostly by manually writing out all dependencies, targets, and
makefile includes.

~~~
make install
ln -s /project/expeditions/eddies_project_data/web_viewer htdocs/data
rsync -kurpt --delete-after htdocs/ USER@MACH.cs.umn.edu:/web/research/ucc.umn.edu/eddies/viewer
# Verify the permissions on the files are correct.
~~~

Documentation
-------------

There are two main branches of developer documentation: the conceptual
documentation, which is located in `web_viewer_notes`, and the
reference documentation.  The reference documentation is generated via
`make docs` and is placed in the directory `docs/jsdocs`.

Data
----

To quickly set up a local development environment with all the
necessary data, simply run the `get_data.sh` script.  It will download
all the required data for the `blue_marble` and `data` directories
that are not included in this repository.

See the conceptual documentation for more detailed information on the
data.
