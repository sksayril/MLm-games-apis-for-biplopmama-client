let mongoose = require("mongoose");

mongoose.connect(process.env.DATABASE_URL);
mongoose.connection
  .on("open", () => console.log("Database connected!"))
  .on("error", (error) => {
    console.log(`Connection failed: ${error}`);
  });
