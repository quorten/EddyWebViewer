;; Emacs Lisp functions that can be useful for maintaining progress
;; and knowledge logs.

(defun pl-stamp-time ()
  "Stamp the current time string in the current buffer."
  (interactive)
  (insert (current-time-string)))

(defun pl-template ()
  "Create beginning and ending timestamp templates for a log entry."
  (interactive)
  (insert "<p>Log entry start at " (current-time-string) "</p>\n\n"
	  "<p>Finished log entry at </p>\n<hr />\n\n"))

(defun pl-topic (title anchor)
  "Insert an HTML topic template, which includes a title for the
topic and a link to the topic from the table of contents."
  (interactive "MTitle: \nMAnchor: ")
  (save-excursion
    (goto-char (point-min))
    (search-forward "<h2>Contents</h2>")
    (search-forward "<!-- ________________________________________ -->")
    (search-backward "</ul>")
    (insert "  <li><a href=\"#" anchor "\">\n"
	    "      " title "</a></li>\n"))
  (insert "<hr />\n" 
	  "<!-- ________________________________________ -->\n\n"
	  "<h2><a name=\"" anchor "\" id=\"" anchor"\">\n"
	  "    " title "</a></h2>\n\n"))
