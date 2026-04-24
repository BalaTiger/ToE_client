/^C:/{f=$0;gsub(/\\/,"/",f);sub(/.*src\//,"src/",f);sub(/  .*/,"",f)}
/^[ \t]*[0-9]+:[0-9]+/{r=$NF;files[f]++;rules[r]++}
END{
  print "=== By File ==="
  for(k in files) print files[k]"\t"k
  print "\n=== By Rule ==="
  for(k in rules) print rules[k]"\t"k
}
