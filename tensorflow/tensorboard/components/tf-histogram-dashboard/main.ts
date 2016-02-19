var rm = new TF.Backend.RequestManager();
var backend = new TF.Backend.Backend("/components/tf-tensorboard/demo/giant_data", rm, true);

function makeHistogramDashboard(el: any) {


  var chartsContainer: d3.Selection<HCategory> = d3.select(el);

  interface RunTag {
    run: string;
    tag: string;
  }

  interface HCategory {
    name: string;
    runTags: RunTag[];
  }

  function histogramCategories(x: TF.Backend.RunsResponse): HCategory[] {
    var enumerations = <TF.Backend.RunEnumeration[]> _.values(x);
    var tags: string[][] = enumerations.map((e) => e.histograms);
    var all_tags: string[] = _.union.apply(null, tags);
    var categorizer = Categorizer.topLevelNamespaceCategorizer;
    var categories = categorizer(all_tags);

    var runNames = _.keys(x);
    function tag2runtag(t: string): RunTag[] {
      return runNames.filter((r) => {
        return x[r].histograms.indexOf(t) !== -1;
      }).map((r) => {return {tag: t, run: r}});
    }

    return categories.map((c) => {
      return {
        name: c.name,
        runTags: _.flatten(c.tags.map(tag2runtag))
      };
    });
  };

  backend.runs().then((x) => {
    var hcats = histogramCategories(x);
    var d3category = chartsContainer.selectAll(".category")
        .data(hcats)
      .enter().append("div")
          .classed("category", true);

    var d3chart = d3category.selectAll(".chart")
        .data((d) => d.runTags)
      .enter().append("div")
        .classed("chart", true);
    d3chart.append("p").text((d: RunTag) => d.run + " " + d.tag);
    console.log(hcats);
  });

}
